import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'install-dependencies.sh'


class InstallDependenciesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        binary = self.root / 'bin'
        binary.mkdir()
        programs = {
            'id': 'echo 0',
            'dpkg-query': 'test -f "$FIXTURE_ROOT/installed" && echo "install ok installed"',
            'apt-get': 'echo "apt-get $*" >> "$FIXTURE_ROOT/log"; test ! -f "$FIXTURE_ROOT/fail"',
            'add-apt-repository': 'echo "repository $*" >> "$FIXTURE_ROOT/log"',
            'node': 'if [[ "$*" == *process.versions* ]]; then echo 24; else echo v24.0.0; fi',
            'npm': 'echo 11.0.0',
            'php': 'exit 0',
            'composer': 'echo "Composer version 2.7.2"',
            'systemctl': 'echo "systemctl $*" >> "$FIXTURE_ROOT/log"',
        }
        for name, body in programs.items():
            file = binary / name
            file.write_text('#!/bin/bash\n'+body+'\n')
            file.chmod(0o755)
        self.env = {**os.environ, 'PATH': f'{binary}:{os.environ["PATH"]}', 'FIXTURE_ROOT': str(self.root)}

    def invoke(self):
        return subprocess.run(['bash', str(SCRIPT)], env=self.env, capture_output=True, text=True)

    def test_missing_packages_installed_before_services_start(self):
        result = self.invoke()
        self.assertEqual(result.returncode, 0, result.stderr)
        log = (self.root/'log').read_text()
        for package in ['php8.3-fpm', 'php8.3-mysql', 'composer', 'rsync', 'python3', 'openssh-server', 'acl']:
            self.assertIn(package, log)
        self.assertLess(log.index('apt-get install'), log.index('systemctl enable --now'))

    def test_matching_installation_does_not_reinstall_packages(self):
        (self.root/'installed').touch()
        result = self.invoke()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn('apt-get', (self.root/'log').read_text())

    def test_install_failure_does_not_start_services(self):
        (self.root/'fail').touch()
        result = self.invoke()
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('systemctl', (self.root/'log').read_text())
