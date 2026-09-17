#!/usr/bin/env bash
# One-time administrator setup. This script is NEVER called by GitHub Actions.
set -Eeuo pipefail
umask 0077
[[ $(id -u) == 0 ]] || { echo 'One-time server setup requires an administrator.' >&2; exit 1; }
server_ip=${1:?Usage: sudo bash deploy/setup-server.sh SERVER_IPV4}
python3 -c 'import ipaddress,sys; ipaddress.IPv4Address(sys.argv[1])' "$server_ip"
source_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=/var/www/inventory-deploy

for command in nginx php composer node mysql rsync curl sudo ssh-keygen setfacl; do
    command -v "$command" > /dev/null || { echo "Install missing prerequisite: $command" >&2; exit 1; }
done
test -S /run/php/php8.3-fpm.sock
node -e 'if (Number(process.versions.node.split(".")[0]) !== 24) process.exit(1)'
if ! id deploy > /dev/null 2>&1; then
    useradd --create-home --shell /bin/bash deploy
fi
usermod -aG www-data deploy
install -d -o deploy -g www-data -m 2750 "$root" "$root/api" "$root/web" \
    "$root/api/releases" "$root/web/releases" "$root/shared" "$root/incoming"
install -d -o deploy -g www-data -m 2770 \
    "$root/shared/storage" "$root/shared/storage/app" \
    "$root/shared/storage/app/public" "$root/shared/storage/app/private" \
    "$root/shared/storage/framework" "$root/shared/storage/framework/cache" \
    "$root/shared/storage/framework/cache/data" "$root/shared/storage/framework/sessions" \
    "$root/shared/storage/framework/views" "$root/shared/storage/logs"
# PHP-FPM and deploy must both be able to update files created by the other.
setfacl -R -m u:deploy:rwX,u:www-data:rwX,m:rwX "$root/shared/storage"
setfacl -R -d -m u:deploy:rwx,u:www-data:rwx,m:rwx "$root/shared/storage"

# Generate credentials without printing them or putting them in process arguments.
# On rerun, keep the existing key, database and password untouched.
if [[ ! -f $root/shared/api.env ]]; then
    python3 - "$root/shared/api.env" "$server_ip" <<'PY'
import base64, os, secrets, subprocess, sys
path, host = sys.argv[1:]
existing = subprocess.check_output(['mysql', '--batch', '--skip-column-names', '-e',
    "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='inventory_production';"], text=True).strip()
if existing:
    raise SystemExit('inventory_production already exists; refusing to adopt an unknown database.')
password = secrets.token_hex(32)
key = base64.b64encode(secrets.token_bytes(32)).decode()
sql = ("CREATE DATABASE inventory_production CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n"
       f"CREATE USER 'inventory_app'@'127.0.0.1' IDENTIFIED BY '{password}';\n"
       "GRANT ALL PRIVILEGES ON inventory_production.* TO 'inventory_app'@'127.0.0.1';\n")
subprocess.run(['mysql'], input=sql, text=True, check=True)
config = f'''APP_NAME="Inventory"
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
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o640)
with os.fdopen(fd, 'w') as file:
    file.write(config)
PY
    chown deploy:www-data "$root/shared/api.env"
    chmod 0640 "$root/shared/api.env"
fi

for unit in "$source_dir"/systemd/*; do
    install -o root -g root -m 0644 "$unit" "/etc/systemd/system/$(basename "$unit")"
done
visudo -cf "$source_dir/sudoers"
install -o root -g root -m 0440 "$source_dir/sudoers" /etc/sudoers.d/inventory-deploy
systemctl daemon-reload
systemctl enable inventory-web.service inventory-queue.service inventory-scheduler.timer

install -o root -g root -m 0644 "$source_dir/nginx.conf" /etc/nginx/sites-available/inventory
# Preserve the stock site's file; only remove its activation symlink.
if [[ -L /etc/nginx/sites-enabled/default && $(readlink -f /etc/nginx/sites-enabled/default) == /etc/nginx/sites-available/default ]]; then
    unlink /etc/nginx/sites-enabled/default
fi
ln -sfn /etc/nginx/sites-available/inventory /etc/nginx/sites-enabled/inventory
nginx -t
systemctl reload nginx
printf 'Server prepared. Deployments must connect as deploy. Application URL: http://%s\n' "$server_ip"
