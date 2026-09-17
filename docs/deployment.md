# Deploying inventory-api and web

Push to **`deploy`** to validate and deploy both projects. The API deploys first; the web deployment runs only after API deployment succeeds. Both validation jobs must pass before either live app changes. Other branches do not deploy. Runs are serialized; an active deployment is not cancelled by a newer push.

## This server

| Item | Value |
| --- | --- |
| Web | `http://104.251.219.254/` |
| API | `http://104.251.219.254/api` |
| Laravel health | `http://104.251.219.254/up` |
| SSH account | `deploy` |
| SSH port | `22` |
| Source repository | `/var/www/inventory-basic-starter` |
| Live API | `/var/www/inventory-deploy/api/current` |
| Live web | `/var/www/inventory-deploy/web/current` |
| Laravel environment | `/var/www/inventory-deploy/shared/api.env` |
| Uploads, logs, sessions, views | `/var/www/inventory-deploy/shared/storage` |
| MySQL database | `inventory_production` |
| MySQL account | `inventory_app` at `127.0.0.1` |

The source checkout is separate from live releases. Deployments upload build artifacts; the server does not pull GitHub or need a GitHub repository key. Database credentials and the Laravel key stay on this server. HTTP/IP hosting is the initial configuration; domain/TLS setup is separate.

**Accounts:** Actions builds run on GitHub-hosted runners. Every connection to this server is hard-coded to `deploy`. The release script refuses root. Next.js, queue workers and the scheduler run as `deploy`; PHP-FPM handles requests as `www-data`. Root is used only for initial system configuration. The sudoers file permits exactly the named service operations, not arbitrary `sudo`, shell commands, service files, or package installation.

## Activate GitHub Actions

Open the repository's **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
| --- | --- |
| `DEPLOY_HOST` | `104.251.219.254` |
| `DEPLOY_PORT` | `22` (optional; defaults to 22) |
| `DEPLOY_SSH_KEY` | Complete contents of `/home/deploy/.ssh/inventory_actions` |
| `DEPLOY_KNOWN_HOSTS` | Complete contents of `/home/deploy/.ssh/inventory_known_hosts` |

There is deliberately no `DEPLOY_USER` secret. The workflow always uses `deploy`.

Read the two files in your own SSH terminal, then paste them into the matching GitHub secrets. Do not put them in Git, chat, or this command log:

```bash
ssh deploy@104.251.219.254
cat ~/.ssh/inventory_actions
cat ~/.ssh/inventory_known_hosts
```

The public key is already authorized for `deploy`, with forwarding and PTY disabled. The known-host record comes from this server's actual host public key, not an unverified CI-time `ssh-keyscan`. If the SSH port changes, update both `DEPLOY_PORT` and the known-host entry to `[104.251.219.254]:PORT`.

After the deployment changes are committed in your working copy, push that commit to the deployment branch:

```bash
git push origin HEAD:deploy
```

Do not force-push if Git reports that the remote branch has newer commits; fetch and reconcile them first. Watch the **Deploy inventory** workflow in GitHub's Actions tab. Once a workflow is available for manual dispatch, select branch `deploy`. To retry a release, rerun **all jobs**, because release/artifact names include the run attempt and failed-jobs-only reruns cannot reuse old attempt artifacts.

The server has been smoke-tested locally; the first actual GitHub run is the end-to-end check of repository secrets and runner-to-server connectivity.

## Repeat server setup

These are reusable instructions, **not a claim that every example below was executed**. The separate [command log](deployment-command-log.md) records commands actually issued during this setup.

Prerequisites: Ubuntu 24.04, Nginx, MySQL 8, PHP 8.3 CLI/FPM with MySQL, SQLite, XML, mbstring, curl, zip, GD, intl and bcmath extensions, Composer 2, Node.js 24, Python 3, rsync, curl, sudo, OpenSSH and ACL tools (`setfacl`). The setup script checks the installed tools; it does not silently upgrade packages.

Run once as an administrator from the repository:

```bash
cd /var/www/inventory-basic-starter
sudo bash deploy/setup-server.sh 104.251.219.254
```

This creates the deployment directories, a fresh MySQL database/user with a random password, and a Laravel key. It installs root-owned Nginx/systemd/sudoers files and enables services for reboot. It removes only the activation symlink for Ubuntu's stock Nginx site, keeping the stock configuration file. Existing custom Nginx sites must not compete for `default_server`.

Reruns preserve the environment file and database. If the database already exists but the environment file is missing, the script refuses to guess credentials or replace data. Before the first release, the configured application URLs may return 502/404 because no `current` release exists yet.

Then run as **deploy**:

```bash
cd /var/www/inventory-basic-starter
bash deploy/setup-ssh.sh 104.251.219.254
```

The SSH setup preserves existing authorized keys. Initial setup needs an administrator; all routine deployment commands below run as `deploy`.

## Initial application data and admin

On this server, initial data and the admin account were created on **2026-09-17**. The credentials are in `/home/deploy/inventory-admin-credentials.txt`, readable only by deploy and the administrator. Do not rerun the initialization below on this existing database; it is provided for future fresh installations.

Deployment runs migrations but never seeds demo data or resets passwords. On a **new, empty database**, initialize application master data once. Run the following as `deploy` from the live API directory. It refuses to run if users already exist, runs the repository's default seeder in a transaction, and replaces the seed admin's default password with a random password before committing. It writes the credentials only to a private file in your home directory.

```bash
cd /var/www/inventory-deploy/api/current
php <<'PHP'
<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (App\Models\User::query()->exists()) {
    throw new RuntimeException('Users already exist; initial setup refused.');
}
$path = getenv('HOME').'/inventory-admin-credentials.txt';
$file = fopen($path, 'x');
if (!$file) { throw new RuntimeException('Credential file already exists or is not writable.'); }
chmod($path, 0600);
$password = bin2hex(random_bytes(24));
try {
    Illuminate\Support\Facades\DB::transaction(function () use ($password) {
        Illuminate\Support\Facades\Artisan::call('db:seed', ['--force' => true]);
        App\Models\User::where('email', 'admin@example.com')->firstOrFail()
            ->forceFill(['password' => Illuminate\Support\Facades\Hash::make($password)])->save();
    });
    fwrite($file, "Email: admin@example.com\nPassword: $password\n");
    fclose($file);
    echo "Admin credentials saved to $path\n";
} catch (Throwable $error) {
    fclose($file);
    unlink($path);
    throw $error;
}
PHP
```

Read `~/inventory-admin-credentials.txt` privately, log in, and update the account details. Mail initially uses Laravel's `log` mailer; set your mail provider credentials in the shared environment file before expecting actual email delivery. No legacy-data import or demo product seeder is run automatically.

## Manual deployment and rollback

Normal deployments require only a Git push. For manual recovery, use the same scripts as CI. Build from the repository on **Ubuntu 24.04 x86_64 with PHP 8.3 and Node 24**, matching this server and the GitHub runner. Next.js standalone artifacts contain native dependencies; macOS/ARM builds are not interchangeable. The commands below alter only dependencies/build output:

```bash
cd inventory-api
composer install --no-dev --prefer-dist --no-interaction --optimize-autoloader
cd ../web
npm ci --no-audit --no-fund
NEXT_PUBLIC_API_URL=/api npm run build
cd ..
release_id="$(git rev-parse HEAD)-manual-$(date -u +%Y%m%d%H%M%S)"
bash deploy/package.sh api "$release_id" /tmp/inventory-packages
bash deploy/package.sh web "$release_id" /tmp/inventory-packages
scp /tmp/inventory-packages/*"$release_id"* deploy@104.251.219.254:/var/www/inventory-deploy/incoming/
ssh deploy@104.251.219.254 "bash -s -- api $release_id" < deploy/release.sh
ssh deploy@104.251.219.254 "bash -s -- web $release_id" < deploy/release.sh
```

Use a fresh release ID each time; existing releases are never overwritten. Deployments keep previous release directories and incoming packages for manual recovery. Monitor disk space and remove obsolete releases deliberately, retaining `current` and your chosen rollback release.

To roll back, list releases and select a previous directory name:

```bash
ls /var/www/inventory-deploy/api/releases
ls /var/www/inventory-deploy/web/releases
cd /var/www/inventory-basic-starter
bash deploy/release.sh rollback api PREVIOUS_RELEASE_ID
bash deploy/release.sh rollback web PREVIOUS_RELEASE_ID
```

Rollback only switches prepared code and restarts services. It does **not** reverse database migrations or restore a database backup. Write migrations compatible with both the previous and new code. If web deployment fails after API succeeded, the API remains at its new release while web returns to its prior release; both projects must tolerate that transition. Brief service restart downtime is expected.

## Checks and logs

As `deploy`:

```bash
whoami
readlink -f /var/www/inventory-deploy/api/current
readlink -f /var/www/inventory-deploy/web/current
systemctl is-active inventory-web inventory-queue inventory-scheduler.timer
systemctl show inventory-web inventory-queue -p User -p Group -p MainPID
curl -f http://127.0.0.1/up
curl -I http://127.0.0.1/login
curl -i -H 'Accept: application/json' http://127.0.0.1/api/me
tail -n 100 /var/www/inventory-deploy/shared/storage/logs/laravel.log
cd /var/www/inventory-deploy/api/current
php artisan migrate:status
php artisan queue:failed
```

Unauthenticated `/api/me` should return **401**, while `/up` and `/login` return **200**. Uploaded files use `/storage/...`.

An administrator can inspect system logs/configuration:

```bash
sudo nginx -t
sudo journalctl -u inventory-web -u inventory-queue -u inventory-scheduler --since '30 minutes ago'
sudo tail -n 100 /var/log/nginx/error.log
sudo -l -U deploy
```

For a runtime environment change, edit the shared environment file as deploy and redeploy. Do not regenerate `APP_KEY`. Back up MySQL and shared storage before application changes that alter data.

The workflow, release scripts, setup scripts, and this guide are the reusable record. The command log records this particular setup session, including diagnostic failures and retries; do not blindly replay it as a setup script.
