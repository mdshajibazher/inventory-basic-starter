import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'provision-database.py'


class ProvisionDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.env_file = self.root / 'api.env'
        binary = self.root / 'bin'
        binary.mkdir()
        mysql = binary / 'mysql'
        mysql.write_text('''#!/usr/bin/env python3
import os, pathlib, sys
root = pathlib.Path(os.environ['FIXTURE_ROOT'])
if '-e' in sys.argv:
    if (root/'existing').exists(): print('inventory_production')
else:
    sql = sys.stdin.read()
    (root/'sql').write_text(sql)
    if (root/'fail').exists(): sys.exit(1)
''')
        mysql.chmod(0o755)
        self.env = {**os.environ, 'PATH': f'{binary}:{os.environ["PATH"]}', 'FIXTURE_ROOT': str(self.root)}

    def invoke(self):
        return subprocess.run(['python3', str(SCRIPT), str(self.env_file), '192.0.2.10'], env=self.env, capture_output=True, text=True)

    def test_new_database_has_private_persistent_credentials(self):
        result = self.invoke()
        self.assertEqual(result.returncode, 0, result.stderr)
        content = self.env_file.read_text()
        self.assertIn('APP_URL=http://192.0.2.10', content)
        self.assertTrue((self.root/'.bootstrap-database').exists())
        password = next(line.split('=', 1)[1] for line in content.splitlines() if line.startswith('DB_PASSWORD='))
        self.assertNotIn(password, result.stdout + result.stderr)
        self.assertEqual(self.env_file.stat().st_mode & 0o777, 0o640)

    def test_rerun_does_not_change_credentials_or_execute_sql(self):
        self.assertEqual(self.invoke().returncode, 0)
        original = self.env_file.read_bytes()
        (self.root/'sql').unlink()
        self.assertEqual(self.invoke().returncode, 0)
        self.assertEqual(original, self.env_file.read_bytes())
        self.assertFalse((self.root/'sql').exists())

    def test_unknown_existing_database_is_not_adopted(self):
        (self.root/'existing').touch()
        result = self.invoke()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.env_file.exists())
        self.assertFalse((self.root/'sql').exists())

    def test_interrupted_sql_resumes_with_same_generated_password(self):
        (self.root/'fail').touch()
        result = self.invoke()
        self.assertNotEqual(result.returncode, 0)
        state = self.root/'.bootstrap-provision.json'
        pending = json.loads(state.read_text())
        self.assertEqual(state.stat().st_mode & 0o777, 0o600)
        (self.root/'fail').unlink()
        (self.root/'existing').touch()
        result = self.invoke()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('DB_PASSWORD='+pending['password'], self.env_file.read_text())
        self.assertFalse(state.exists())

    def test_existing_env_without_bootstrap_marker_does_not_authorize_seeding(self):
        self.env_file.write_text('APP_KEY=keep\nDB_PASSWORD=keep\n')
        result = self.invoke()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.root/'.bootstrap-database').exists())

    def test_restored_environment_is_checked_before_any_password_change(self):
        (self.root/'fail').touch()
        self.assertNotEqual(self.invoke().returncode, 0)
        (self.root/'fail').unlink()
        (self.root/'sql').unlink()
        self.env_file.write_text('APP_KEY=restored\nDB_PASSWORD=restored\n')
        result = self.invoke()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root/'sql').exists())
        self.assertIn('DB_PASSWORD=restored', self.env_file.read_text())
