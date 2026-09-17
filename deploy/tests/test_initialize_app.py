"""Exercise bootstrap initialization using real Laravel and disposable SQLite."""
import json
import os
import re
from pathlib import Path
import sqlite3
import shutil
import subprocess
import tempfile
import unittest


HELPER = Path(__file__).resolve().parents[1] / "initialize-app.php"
PROJECT = Path(__file__).resolve().parents[2] / "inventory-api"
VENDOR = Path(os.environ.get("INITIALIZER_TEST_VENDOR", str(PROJECT / "vendor")))


@unittest.skipUnless((VENDOR / "autoload.php").exists(), "Laravel vendor dependencies unavailable")
class InitializerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.app = self.root / "app"
        self.shared = self.root / "shared"
        self.shared.mkdir()
        (self.shared / ".bootstrap-database").touch()
        self.credentials = self.root / "credentials.txt"
        for directory in ("bootstrap/cache", "config", "storage/logs", "database"):
            (self.app / directory).mkdir(parents=True)
        (self.app / "vendor").symlink_to(VENDOR)
        self.db = self.app / "database/database.sqlite"
        with sqlite3.connect(self.db) as db:
            db.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, password TEXT)")
        (self.app / "config/database.php").write_text("<?php return ['default'=>'sqlite','connections'=>['sqlite'=>['driver'=>'sqlite','database'=>__DIR__.'/../database/database.sqlite','prefix'=>'']]];")
        (self.app / "config/app.php").write_text("<?php return ['name'=>'Initializer test','key'=>'base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=','cipher'=>'AES-256-CBC'];")
        (self.app / "bootstrap/app.php").write_text("""<?php
require __DIR__.'/../TestSeeder.php';
return Illuminate\\Foundation\\Application::configure(basePath: dirname(__DIR__))->create();
""")
        (self.app / "TestSeeder.php").write_text("""<?php
namespace Database\\Seeders;
class DatabaseSeeder extends \\Illuminate\\Database\\Seeder {
 public function run(): void {
  \\Illuminate\\Support\\Facades\\DB::table('users')->insert(['email'=>'admin@example.com','password'=>password_hash('password', PASSWORD_BCRYPT)]);
  if (file_exists(base_path('fail-seed'))) { throw new \\RuntimeException('simulated seeder failure'); }
 }
}
""")

    def run_helper(self):
        command = ["php", str(HELPER), str(self.app), str(self.shared), str(self.credentials)]
        return subprocess.run(command, cwd=self.app, text=True, capture_output=True)

    def users(self):
        with sqlite3.connect(self.db) as db:
            return db.execute("SELECT email,password FROM users").fetchall()

    def test_seeds_random_password_and_protects_credentials(self):
        result = self.run_helper()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        data = self.credentials.read_text()
        self.assertIn("admin@example.com", data)
        password = data.split("Password: ")[1].strip()
        self.assertEqual(len(password), 64)
        self.assertNotIn(password, result.stdout + result.stderr)
        self.assertEqual(self.credentials.stat().st_mode & 0o777, 0o600)
        # Pass secrets over stdin, never through arguments or the command log.
        command = ['php', '-r', '$v=json_decode(stream_get_contents(STDIN),true); exit(password_verify($v[0],$v[1]) ? 0 : 1);']
        check = subprocess.run(command, input=json.dumps([password, self.users()[0][1]]), text=True)
        self.assertEqual(check.returncode, 0)
        self.assertTrue((self.shared / '.bootstrap-initialized').is_file())
        original = self.users()
        self.assertEqual(self.run_helper().returncode, 0)
        self.assertEqual(original, self.users())
        self.assertEqual(data, self.credentials.read_text())

    def test_existing_database_is_preserved_without_seeding(self):
        with sqlite3.connect(self.db) as db:
            db.execute("INSERT INTO users VALUES (1,'someone@example.com','untouched')")
        self.assertEqual(self.run_helper().returncode, 0)
        self.assertEqual(self.users(), [('someone@example.com', 'untouched')])
        self.assertFalse(self.credentials.exists())

    def test_failed_seed_rolls_back_and_retry_reuses_credentials(self):
        (self.app / 'fail-seed').touch()
        self.assertNotEqual(self.run_helper().returncode, 0)
        self.assertEqual(self.users(), [])
        self.assertFalse((self.shared / '.bootstrap-initialized').exists())
        self.assertTrue(self.credentials.is_file(), 'recoverable credentials must survive failure')
        original = self.credentials.read_text()
        (self.app / 'fail-seed').unlink()
        self.assertEqual(self.run_helper().returncode, 0)
        self.assertEqual(self.credentials.read_text(), original)

    def test_preexisting_credentials_are_never_overwritten(self):
        self.credentials.write_text('unrelated user data')
        result = self.run_helper()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Refusing to replace an existing credentials file.', result.stderr)
        self.assertEqual(self.credentials.read_text(), 'unrelated user data')
        self.assertEqual(self.users(), [])

    def test_tampered_pending_credentials_are_rejected(self):
        (self.app / 'fail-seed').touch()
        self.run_helper()
        self.credentials.write_text('')
        (self.app / 'fail-seed').unlink()
        self.assertNotEqual(self.run_helper().returncode, 0)
        self.assertEqual(self.users(), [])

    def test_missing_authorization_prevents_seeding(self):
        (self.shared / '.bootstrap-database').unlink()
        self.assertNotEqual(self.run_helper().returncode, 0)
        self.assertEqual(self.users(), [])

    def test_committed_database_without_marker_preserves_password(self):
        self.assertEqual(self.run_helper().returncode, 0)
        users = self.users()
        original = self.credentials.read_bytes()
        (self.shared / '.bootstrap-initialized').unlink()
        self.assertEqual(self.run_helper().returncode, 0)
        self.assertEqual(self.users(), users)
        self.assertEqual(self.credentials.read_bytes(), original)

    def test_credentials_symlink_is_rejected_without_modifying_target(self):
        target = self.root / 'unrelated.txt'
        target.write_text('preserve me')
        self.credentials.symlink_to(target)
        self.assertNotEqual(self.run_helper().returncode, 0)
        self.assertEqual(target.read_text(), 'preserve me')
        self.assertEqual(self.users(), [])

    def test_missing_credentials_directory_prevents_database_changes(self):
        self.credentials = self.root / 'missing' / 'credentials.txt'
        self.assertNotEqual(self.run_helper().returncode, 0)
        self.assertEqual(self.users(), [])

    def test_real_inventory_migrations_and_seeder(self):
        source = PROJECT
        if not (source / 'artisan').exists():
            self.skipTest('full inventory application unavailable')
        shutil.rmtree(self.app)
        self.app.mkdir()
        for directory in ('app', 'bootstrap', 'config', 'database', 'routes'):
            shutil.copytree(source / directory, self.app / directory,
                            ignore=shutil.ignore_patterns('cache', '*.sqlite'))
        # MySQL UPDATE JOIN backfills cannot run on SQLite. The fixture has
        # no invoice rows to backfill; retain its schema changes and skip only
        # the data updates in the disposable copy (never the source application).
        for migration in (self.app / 'database/migrations').glob('*.php'):
            migration.write_text(re.sub(
                r"DB::table\([^;]+?->(?:join|leftJoin)\([^;]+?->update\([^;]+?;",
                '/* Empty-table MySQL backfill omitted in SQLite fixture. */',
                migration.read_text(), flags=re.DOTALL))
        (self.app / 'bootstrap/cache').mkdir()
        (self.app / 'storage/logs').mkdir(parents=True)
        (self.app / 'storage/framework/views').mkdir(parents=True)
        (self.app / 'vendor').symlink_to(VENDOR)
        shutil.copy2(source / 'artisan', self.app / 'artisan')
        self.db.touch()
        (self.app / '.env').write_text('\n'.join([
            'APP_ENV=testing', 'APP_KEY=base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
            'DB_CONNECTION=sqlite', 'DB_DATABASE=' + str(self.db),
            'CACHE_STORE=array', 'SESSION_DRIVER=array', 'QUEUE_CONNECTION=sync',
        ]))
        command = ['php', 'artisan', 'migrate', '--force', '--no-interaction']
        result = subprocess.run(command, cwd=self.app, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        result = self.run_helper()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(len(self.users()), 1)
        self.assertTrue(self.credentials.read_text().startswith('Inventory administrator'))


if __name__ == '__main__':
    unittest.main()
