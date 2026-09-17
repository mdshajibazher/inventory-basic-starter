#!/usr/bin/env python3
"""Administrator-only bootstrap helper; preserve credentials across interruptions."""
import base64
import ipaddress
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys


def durable_write(path, content, mode):
    temporary = path.with_name(path.name + '.tmp')
    with open(temporary, 'w', opener=lambda name, flags: os.open(name, flags, mode)) as file:
        os.fchmod(file.fileno(), mode)
        file.write(content)
        file.flush()
        os.fsync(file.fileno())
    os.replace(temporary, path)
    directory = os.open(path.parent, os.O_DIRECTORY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def main():
    path = Path(sys.argv[1])
    host = str(ipaddress.IPv4Address(sys.argv[2]))
    state = path.parent / '.bootstrap-provision.json'
    marker = path.parent / '.bootstrap-database'
    if path.exists() and not state.exists():
        print('Preserving existing API environment and database credentials.')
        return
    if state.exists():
        pending = json.loads(state.read_text())
        if pending['host'] != host:
            raise SystemExit('Incomplete setup belongs to a different server IP; restore its original argument.')
    else:
        existing = subprocess.check_output([
            'mysql', '--batch', '--skip-column-names', '-e',
            "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='inventory_production'; "
            "SELECT User FROM mysql.user WHERE User='inventory_app' AND Host='127.0.0.1';",
        ], text=True).strip()
        if existing:
            raise SystemExit('Existing database/user has no saved credentials. Restore shared/api.env; nothing was changed.')
        pending = {'host': host, 'password': secrets.token_hex(32),
                   'key': base64.b64encode(secrets.token_bytes(32)).decode()}
        durable_write(state, json.dumps(pending), 0o600)

    password, key = pending['password'], pending['key']
    # Credentials are generated locally and persisted before the first DDL statement.
    # MySQL DDL is not transactional; this owned pending record makes retries safe.
    if len(password) != 64 or any(c not in '0123456789abcdef' for c in password):
        raise SystemExit('Invalid pending provisioning record; refusing SQL execution.')
    sql = ("CREATE DATABASE IF NOT EXISTS inventory_production CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n"
           f"CREATE USER IF NOT EXISTS 'inventory_app'@'127.0.0.1' IDENTIFIED BY '{password}';\n"
           f"ALTER USER 'inventory_app'@'127.0.0.1' IDENTIFIED BY '{password}';\n"
           "GRANT ALL PRIVILEGES ON inventory_production.* TO 'inventory_app'@'127.0.0.1';\n")
    content = f'''APP_NAME="Inventory"
APP_ENV=production
APP_KEY=base64:{key}
APP_DEBUG=false
APP_URL=http://{host}
LOG_CHANNEL=stack
LOG_STACK=single
LOG_LEVEL=warning
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=inventory_production
DB_USERNAME=inventory_app
DB_PASSWORD={password}
SESSION_DRIVER=database
SESSION_LIFETIME=120
SESSION_ENCRYPT=false
SESSION_PATH=/
QUEUE_CONNECTION=database
CACHE_STORE=database
FILESYSTEM_DISK=local
MAIL_MAILER=log
'''
    if path.exists() and path.read_text() != content:
        raise SystemExit('Existing environment differs from pending setup; refusing to replace it.')
    # Check restored/edited credentials BEFORE any database account changes.
    # Never expose SQL/password through command arguments or exception output.
    result = subprocess.run(['mysql'], input=sql, text=True, capture_output=True)
    if result.returncode:
        raise SystemExit('Database provisioning failed. Check local MySQL administrator access, then rerun; pending credentials were preserved.')
    if not path.exists():
        durable_write(path, content, 0o640)
    durable_write(marker, 'Fresh database created by setup-server.sh\n', 0o640)
    state.unlink()
    print('Fresh database and persistent API environment are ready.')


if __name__ == '__main__':
    main()
