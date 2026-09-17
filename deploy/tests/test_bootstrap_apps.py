import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

DEPLOY = Path(__file__).resolve().parents[1]


class BootstrapAppsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.source = self.base/'source'
        self.root = self.base/'live'
        for folder in ['source/deploy','source/inventory-api','source/web','live/incoming','live/shared','live/api/releases','live/web/releases','bin']:
            (self.base/folder).mkdir(parents=True)
        shutil.copy(DEPLOY/'package.sh', self.source/'deploy/package.sh')
        (self.source/'deploy/initialize-app.php').write_text('<?php // fixture')
        (self.root/'shared/.bootstrap-database').touch()
        (self.source/'deploy/release.sh').write_text('''#!/bin/bash
set -e
echo "release $*" >> "$FIXTURE_LOG"
mkdir -p "$INVENTORY_DEPLOY_ROOT/$1/releases/$2"
touch "$INVENTORY_DEPLOY_ROOT/$1/releases/$2/.ready"
ln -s "$INVENTORY_DEPLOY_ROOT/$1/releases/$2" "$INVENTORY_DEPLOY_ROOT/$1/current"
''')
        programs = {
            'id': 'if [[ $1 == -un ]]; then echo deploy; else echo 1000; fi',
            'composer': 'echo composer >> "$FIXTURE_LOG"; mkdir -p vendor; touch vendor/autoload.php',
            'npm': '''echo "npm $*" >> "$FIXTURE_LOG"
if [[ "$*" == 'run build' ]]; then
    [[ ${FAIL_WEB:-0} != 1 ]] || exit 1
    mkdir -p .next/standalone .next/static
    touch .next/standalone/server.js .next/static/app.js
fi''',
        }
        for name, content in programs.items():
            path=self.base/'bin'/name
            path.write_text('#!/bin/bash\nset -e\n'+content+'\n')
            path.chmod(0o755)
        self.env={**os.environ,'PATH':f'{self.base}/bin:{os.environ["PATH"]}', 'FIXTURE_LOG':str(self.base/'log'), 'INVENTORY_DEPLOY_ROOT':str(self.root)}

    def invoke(self, **env):
        return subprocess.run(['bash', str(DEPLOY/'bootstrap-apps.sh'), str(self.source), str(self.root)], env={**self.env,**env}, capture_output=True,text=True)

    def test_web_build_failure_never_activates_api(self):
        result=self.invoke(FAIL_WEB='1')
        self.assertNotEqual(result.returncode,0)
        self.assertNotIn('release ',(self.base/'log').read_text())
        self.assertFalse((self.root/'api/current').exists())

    def test_both_apps_deploy_then_rerun_skips_builds(self):
        result=self.invoke()
        self.assertEqual(result.returncode,0,result.stderr)
        log=(self.base/'log').read_text()
        self.assertLess(log.index('npm run build'),log.index('release api'))
        self.assertLess(log.index('release api'),log.index('release web'))
        self.assertIn('--initialize',log)
        (self.base/'log').unlink()
        result=self.invoke()
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertFalse((self.base/'log').exists())

    def test_existing_database_is_not_seeded(self):
        (self.root/'shared/.bootstrap-database').unlink()
        result=self.invoke()
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertNotIn('--initialize',(self.base/'log').read_text())
