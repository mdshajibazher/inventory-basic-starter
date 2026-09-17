<?php

declare(strict_types=1);

// Bootstrap-only helper. release.sh runs this as deploy after migrations.
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

final class BootstrapInitializationException extends RuntimeException
{
}

function failInitialization(string $message): never
{
    throw new BootstrapInitializationException($message);
}

function pathExists(string $path): bool
{
    return file_exists($path) || is_link($path);
}

function durableCreate(string $path, string $contents): void
{
    $directory = dirname($path);
    if (!is_dir($directory) || pathExists($path)) {
        failInitialization('Cannot create bootstrap state: destination exists or directory is missing.');
    }
    $temporary = $directory.'/.bootstrap-write-'.bin2hex(random_bytes(16));
    $file = @fopen($temporary, 'x+b');
    if ($file === false) {
        failInitialization('Cannot create bootstrap state file.');
    }
    try {
        if (!chmod($temporary, 0600) || fwrite($file, $contents) !== strlen($contents)
            || !fflush($file) || !fsync($file)) {
            failInitialization('Cannot securely persist bootstrap state.');
        }
        // link is atomic and, unlike rename, never overwrites an existing file.
        if (!@link($temporary, $path)) {
            failInitialization('Cannot install bootstrap state without overwriting a file.');
        }
        $dir = @fopen($directory, 'r');
        if ($dir === false) {
            failInitialization('Cannot sync bootstrap state directory.');
        }
        try {
            if (!fsync($dir)) {
                failInitialization('Cannot sync bootstrap state directory.');
            }
        } finally {
            fclose($dir);
        }
    } finally {
        fclose($file);
        @unlink($temporary);
    }
}

function readPrivateFile(string $path): string
{
    clearstatcache(true, $path);
    if (is_link($path) || !is_file($path) || (fileperms($path) & 0777) !== 0600
        || fileowner($path) !== posix_geteuid()) {
        failInitialization('Bootstrap credentials or pending state are not a private owned regular file.');
    }
    $contents = file_get_contents($path);
    if ($contents === false || $contents === '') {
        failInitialization('Bootstrap credentials or pending state are unreadable or empty.');
    }
    return $contents;
}

umask(0077);
$lock = null;
try {
    if ($argc !== 4) {
        failInitialization('Usage: initialize-app.php APP_DIRECTORY SHARED_DIRECTORY CREDENTIALS_FILE');
    }
    [$script, $appPath, $sharedPath, $credentialsPath] = $argv;
    $shared = realpath($sharedPath);
    $appDirectory = realpath($appPath);
    $credentialsDirectory = realpath(dirname($credentialsPath));
    if ($shared === false || !is_dir($shared) || $appDirectory === false
        || $credentialsDirectory === false || !is_dir($credentialsDirectory)) {
        failInitialization('Bootstrap paths must have existing directories.');
    }
    $credentials = $credentialsDirectory.'/'.basename($credentialsPath);
    $marker = $shared.'/.bootstrap-initialized';
    $lockPath = $shared.'/.bootstrap-initialize.lock';
    if (is_link($lockPath)) {
        failInitialization('Bootstrap lock must not be a symbolic link.');
    }
    $lock = @fopen($lockPath, 'c+b');
    if ($lock === false || !flock($lock, LOCK_EX)) {
        failInitialization('Cannot acquire bootstrap initialization lock.');
    }
    if (pathExists($marker)) {
        if (is_link($marker) || !is_file($marker) || file_get_contents($marker) !== "initialized\n") {
            failInitialization('Invalid bootstrap completion marker.');
        }
        exit(0);
    }
    if (is_link($shared.'/.bootstrap-database') || !is_file($shared.'/.bootstrap-database')) {
        failInitialization('Database initialization is not authorized by bootstrap.');
    }

    require $appDirectory.'/vendor/autoload.php';
    $app = require $appDirectory.'/bootstrap/app.php';
    $app->make(Kernel::class)->bootstrap();

    DB::transaction(function () use ($shared, $credentials): void {
        // Existing users also cover recovery after a successful commit but before
        // the completion marker was persisted. Never seed or reset their password.
        if (DB::table('users')->exists()) {
            return;
        }

        $pendingPath = $shared.'/.bootstrap-initialize-pending.json';
        if (pathExists($pendingPath)) {
            $pending = json_decode(readPrivateFile($pendingPath), true, 512, JSON_THROW_ON_ERROR);
            if (!is_array($pending) || ($pending['version'] ?? null) !== 1
                || ($pending['credentials'] ?? null) !== $credentials
                || !is_string($pending['password'] ?? null)
                || !preg_match('/\A[a-f0-9]{64}\z/', $pending['password'])) {
                failInitialization('Invalid pending bootstrap credentials.');
            }
            $password = $pending['password'];
        } else {
            if (pathExists($credentials)) {
                failInitialization('Refusing to replace an existing credentials file.');
            }
            $password = bin2hex(random_bytes(32));
            durableCreate($pendingPath, json_encode([
                'version' => 1, 'credentials' => $credentials, 'password' => $password,
            ], JSON_THROW_ON_ERROR)."\n");
        }
        $contents = "Inventory administrator credentials\nEmail: admin@example.com\nPassword: ".$password."\n";
        if (pathExists($credentials)) {
            if (!hash_equals($contents, readPrivateFile($credentials))) {
                failInitialization('Credentials file does not match pending bootstrap state.');
            }
        } else {
            durableCreate($credentials, $contents);
        }

        if (Artisan::call('db:seed', ['--force' => true, '--no-interaction' => true]) !== 0) {
            failInitialization('Database seeding failed.');
        }
        if (DB::table('users')->where('email', 'admin@example.com')->update([
            'password' => Hash::make($password),
        ]) !== 1) {
            failInitialization('Seeder did not create exactly one expected administrator.');
        }
    });

    // Only persist completion after the database transaction has committed.
    durableCreate($marker, "initialized\n");
    fwrite(STDOUT, "Bootstrap initialization complete.\n");
} catch (Throwable $error) {
    // Framework exception text and seeder output can contain secrets. Keep both
    // out of terminal logs; the credentials file is the only user-facing secret.
    $reason = $error instanceof BootstrapInitializationException
        ? $error->getMessage()
        : 'Check bootstrap paths, private credential files, and application logs before retrying.';
    fwrite(STDERR, "Bootstrap initialization failed; database changes were rolled back if uncommitted. ".$reason."\n");
    exit(1);
} finally {
    if (is_resource($lock)) {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
