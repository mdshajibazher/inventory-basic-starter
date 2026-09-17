import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest


SCRIPTS = Path(__file__).resolve().parents[1]


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def run_script(self, name, *args, env=None):
        return subprocess.run(
            ["bash", str(SCRIPTS / name), *map(str, args)],
            env={**os.environ, **(env or {})}, text=True, capture_output=True,
        )

    def artifact(self, component, release):
        source = self.root / "source"
        source.mkdir(exist_ok=True)
        (source / "artisan").write_text("fixture")
        (source / "server.js").write_text("fixture")
        (source / "bootstrap/cache").mkdir(parents=True, exist_ok=True)
        (source / "public").mkdir(exist_ok=True)
        archive = self.root / "incoming" / f"{component}-{release}.tar.gz"
        with tarfile.open(archive, "w:gz") as tar:
            tar.add(source, arcname=".")
        digest = hashlib.sha256(archive.read_bytes()).hexdigest()
        archive.with_suffix(".gz.sha256").write_text(f"{digest}  {archive.name}\n")
        return archive

    def release_environment(self):
        for folder in ["incoming", "api/releases", "web/releases", "shared/storage", "bin"]:
            (self.root / folder).mkdir(parents=True, exist_ok=True)
        (self.root / "shared/api.env").write_text("APP_KEY=unchanged\n")
        (self.root / "shared/storage/upload.txt").write_text("keep upload")
        commands = {
            "id": '#!/bin/bash\nif [[ "$1" == "-un" ]]; then echo deploy; else echo 1000; fi\n',
            "composer": "#!/bin/bash\nexit 0\n",
            "php": '#!/bin/bash\necho "$*" >> "$INVENTORY_DEPLOY_ROOT/php.log"\n[[ "$*" != *"migrate"* || "${FAIL_MIGRATION:-0}" != 1 ]]\n',
            "sudo": '#!/bin/bash\necho "$*" >> "$INVENTORY_DEPLOY_ROOT/services.log"\n',
            "curl": '#!/bin/bash\n[[ "${FAIL_HEALTH:-0}" != 1 ]]\n',
        }
        for name, content in commands.items():
            file = self.root / "bin" / name
            file.write_text(content)
            file.chmod(0o755)
        return {"INVENTORY_DEPLOY_ROOT": str(self.root), "PATH": f"{self.root / 'bin'}:{os.environ['PATH']}"}

    def previous(self, component):
        previous = self.root / component / "releases" / "previous"
        previous.mkdir()
        (previous / ".ready").touch()
        (self.root / component / "current").symlink_to(previous)
        return previous

    def test_api_activation_preserves_shared_data(self):
        env = self.release_environment()
        self.artifact("api", "abc123-1-1")
        result = self.run_script("release.sh", "api", "abc123-1-1", env=env)
        self.assertEqual(result.returncode, 0, result.stderr)
        current = self.root / "api/current"
        self.assertEqual(current.resolve().name, "abc123-1-1")
        self.assertEqual((current / ".env").read_text(), "APP_KEY=unchanged\n")
        self.assertEqual((current / "storage/upload.txt").read_text(), "keep upload")
        self.assertNotIn('bootstrap-initialize', (self.root/'php.log').read_text())

    def test_initialization_requires_bootstrap_database_and_no_active_api(self):
        env = self.release_environment()
        self.artifact('api', 'fresh-1')
        result = self.run_script('release.sh', 'api', 'fresh-1', '--initialize', env=env)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root/'api/current').exists())

    def test_initializer_runs_only_for_explicit_authorized_first_release(self):
        env = self.release_environment()
        (self.root/'shared/.bootstrap-database').touch()
        (self.root/'source').mkdir()
        (self.root/'source/.bootstrap-initialize.php').write_text('<?php // fixture')
        self.artifact('api', 'fresh-2')
        result = self.run_script('release.sh', 'api', 'fresh-2', '--initialize', env=env)
        self.assertEqual(result.returncode, 0, result.stderr)
        log = (self.root/'php.log').read_text()
        self.assertLess(log.index('migrate'), log.index('.bootstrap-initialize.php'))
        self.assertLess(log.index('.bootstrap-initialize.php'), log.index('config:cache'))

    def test_active_api_cannot_be_reinitialized(self):
        env = self.release_environment()
        (self.root/'shared/.bootstrap-database').touch()
        previous = self.previous('api')
        self.artifact('api', 'fresh-3')
        result = self.run_script('release.sh', 'api', 'fresh-3', '--initialize', env=env)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.root/'api/current').resolve(), previous)

    def test_failed_migration_keeps_previous_release(self):
        env = self.release_environment()
        previous = self.previous("api")
        self.artifact("api", "abc123-2-1")
        result = self.run_script("release.sh", "api", "abc123-2-1", env={**env, "FAIL_MIGRATION": "1"})
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.root / "api/current").resolve(), previous)

    def test_failed_web_health_restores_previous_release(self):
        env = self.release_environment()
        previous = self.previous("web")
        self.artifact("web", "abc123-3-1")
        result = self.run_script("release.sh", "web", "abc123-3-1", env={**env, "FAIL_HEALTH": "1"})
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.root / "web/current").resolve(), previous)
        self.assertIn("restart inventory-web.service", (self.root / "services.log").read_text())

    def test_checksum_failure_keeps_previous_release(self):
        env = self.release_environment()
        previous = self.previous("api")
        archive = self.artifact("api", "abc123-4-1")
        archive.write_bytes(b"corrupt")
        result = self.run_script("release.sh", "api", "abc123-4-1", env=env)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.root / "api/current").resolve(), previous)

    def test_first_activation_failure_removes_current_and_stops_service(self):
        env = self.release_environment()
        self.artifact("web", "abc123-6-1")
        result = self.run_script("release.sh", "web", "abc123-6-1", env={**env, "FAIL_HEALTH": "1"})
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / "web/current").is_symlink())
        self.assertIn("stop inventory-web.service", (self.root / "services.log").read_text())

    def test_first_api_failure_removes_current_and_stops_workers(self):
        env = self.release_environment()
        self.artifact("api", "abc123-7-1")
        result = self.run_script("release.sh", "api", "abc123-7-1", env={**env, "FAIL_HEALTH": "1"})
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / "api/current").is_symlink())
        commands = (self.root / "services.log").read_text()
        self.assertIn("stop inventory-queue.service", commands)
        self.assertIn("stop inventory-scheduler.timer", commands)

    def test_manual_rollback_uses_prepared_release_without_migration(self):
        env = self.release_environment()
        previous = self.previous("api")
        self.artifact("api", "abc123-5-1")
        self.assertEqual(self.run_script("release.sh", "api", "abc123-5-1", env=env).returncode, 0)
        result = self.run_script("release.sh", "rollback", "api", "previous", env={**env, "FAIL_MIGRATION": "1"})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.root / "api/current").resolve(), previous)

    def test_root_cannot_deploy(self):
        if os.getuid() != 0:
            self.skipTest("root guard is exercised when this test is run as root")
        result = self.run_script("release.sh", "api", "abc123-1-1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("deploy", result.stderr)

    def test_invalid_release_id_is_rejected_before_writing(self):
        env = self.release_environment()
        result = self.run_script("release.sh", "api", "../escape", env=env)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / "api/escape").exists())

    def test_api_package_excludes_secrets_and_mutable_data(self):
        project = self.root / "project"
        (project / "deploy").mkdir(parents=True)
        shutil.copy(SCRIPTS / "package.sh", project / "deploy/package.sh")
        api = project / "inventory-api"
        for path in [".env", ".env.production", "storage/file", "bootstrap/cache/config.php", "database/database.sqlite", "vendor/autoload.php", "artisan"]:
            file = api / path
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text("fixture")
        result = subprocess.run(["bash", str(project / "deploy/package.sh"), "api", "abc123-1-1", str(self.root / "out")], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        with tarfile.open(self.root / "out/api-abc123-1-1.tar.gz") as tar:
            names = [name.removeprefix("./") for name in tar.getnames()]
        for forbidden in [".env", ".env.production", "storage/file", "bootstrap/cache/config.php", "database/database.sqlite"]:
            self.assertNotIn(forbidden, names)
        self.assertIn("vendor/autoload.php", names)
        self.assertIn("artisan", names)


if __name__ == "__main__":
    unittest.main()
