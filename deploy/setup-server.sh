#!/usr/bin/env bash
# Administrator entrypoint; application builds and activation run as deploy.
set -Eeuo pipefail
umask 0077
[[ $(id -u) == 0 ]] || { echo 'Run: sudo bash deploy/setup-server.sh SERVER_IPV4' >&2; exit 1; }
[[ $# == 1 && $1 =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Supply one public IPv4 address.' >&2; exit 1; }
server_ip=$1
IFS=. read -r -a octets <<< "$server_ip"
for octet in "${octets[@]}"; do
    [[ ${#octet} -le 3 && ( $octet == 0 || $octet != 0* ) ]] && (( 10#$octet <= 255 )) || { echo 'Invalid IPv4 address.' >&2; exit 1; }
done
. /etc/os-release
[[ $ID == ubuntu && $VERSION_ID == 24.04 && $(uname -m) == x86_64 ]] || {
    echo 'Supported platform: Ubuntu 24.04 x86_64.' >&2; exit 1;
}
[[ -d /run/systemd/system ]] || { echo 'This script requires a VPS booted with systemd.' >&2; exit 1; }
source_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
project=$(cd "$source_dir/.." && pwd)
root=/var/www/inventory-deploy
for file in inventory-api/artisan inventory-api/composer.lock web/package-lock.json \
    deploy/install-dependencies.sh deploy/provision-database.py deploy/bootstrap-apps.sh \
    deploy/initialize-app.php deploy/package.sh deploy/release.sh deploy/setup-ssh.sh \
    deploy/nginx.conf deploy/sudoers deploy/systemd/inventory-web.service \
    deploy/systemd/inventory-queue.service deploy/systemd/inventory-scheduler.service \
    deploy/systemd/inventory-scheduler.timer; do
    test -f "$project/$file" || { echo "Copy the complete repository first: missing $file" >&2; exit 1; }
done
exec 8>/run/lock/inventory-setup.lock
flock -n 8 || { echo 'Another setup is running.' >&2; exit 1; }
install -d -m 0700 /var/log/inventory-setup
log="/var/log/inventory-setup/$(date -u +%Y%m%dT%H%M%SZ)-$$.log"
touch "$log"
chmod 0600 "$log"
exec > >(tee -a "$log") 2>&1
trap 'status=$?; set +x; printf "Setup failed near line %s (exit %s). Fix the error and rerun. Log: %s\n" "$LINENO" "$status" "$log" >&2; exit "$status"' ERR
# Secrets are generated in Python/PHP, never passed as shell arguments or traced.
set -x
bash -x "$source_dir/install-dependencies.sh"
for attempt in {1..30}; do
    if [[ -S /run/php/php8.3-fpm.sock ]] && mysqladmin ping --silent; then break; fi
    sleep 1
done
test -S /run/php/php8.3-fpm.sock
mysqladmin ping --silent
if ! id deploy >/dev/null 2>&1; then useradd --create-home --shell /bin/bash deploy; fi
[[ $(id -u deploy) != 0 ]]
usermod -aG www-data deploy
deploy_home=$(getent passwd deploy | cut -d: -f6)
test -d "$deploy_home"
install -d -o deploy -g www-data -m 2750 "$root" "$root/api" "$root/web" \
    "$root/api/releases" "$root/web/releases" "$root/shared" "$root/incoming" "$root/builds"
install -d -o deploy -g www-data -m 2770 \
    "$root/shared/storage" "$root/shared/storage/app" \
    "$root/shared/storage/app/public" "$root/shared/storage/app/private" \
    "$root/shared/storage/framework" "$root/shared/storage/framework/cache" \
    "$root/shared/storage/framework/cache/data" "$root/shared/storage/framework/sessions" \
    "$root/shared/storage/framework/views" "$root/shared/storage/logs"
setfacl -R -m u:deploy:rwX,u:www-data:rwX,m:rwX "$root/shared/storage"
setfacl -R -d -m u:deploy:rwx,u:www-data:rwx,m:rwx "$root/shared/storage"
python3 "$source_dir/provision-database.py" "$root/shared/api.env" "$server_ip"
chown deploy:www-data "$root/shared/api.env"
chmod 0640 "$root/shared/api.env"
if [[ -f $root/shared/.bootstrap-database ]]; then chown deploy:www-data "$root/shared/.bootstrap-database"; fi

for unit in "$source_dir"/systemd/*; do
    install -o root -g root -m 0644 "$unit" "/etc/systemd/system/$(basename "$unit")"
done
visudo -cf "$source_dir/sudoers"
install -o root -g root -m 0440 "$source_dir/sudoers" /etc/sudoers.d/inventory-deploy
systemctl daemon-reload
systemctl enable inventory-web.service inventory-queue.service inventory-scheduler.timer
install -o root -g root -m 0644 "$source_dir/nginx.conf" /etc/nginx/sites-available/inventory
if [[ -L /etc/nginx/sites-enabled/default && $(readlink -f /etc/nginx/sites-enabled/default) == /etc/nginx/sites-available/default ]]; then
    unlink /etc/nginx/sites-enabled/default
fi
ln -sfn /etc/nginx/sites-available/inventory /etc/nginx/sites-enabled/inventory
nginx -t
systemctl reload nginx
runuser -u deploy -- env HOME="$deploy_home" bash -x -s -- "$server_ip" < "$source_dir/setup-ssh.sh"

if [[ ! -f $root/api/current/.ready || ! -f $root/web/current/.ready ]]; then
    build="$root/builds/$(date -u +%Y%m%dT%H%M%SZ)-$$"
    install -d -o deploy -g www-data -m 2750 "$build"
    for directory in inventory-api web deploy; do
        install -d -o deploy -g www-data -m 2750 "$build/$directory"
        rsync -a --chown=deploy:www-data --exclude='.git' --exclude='.env*' \
            --exclude='vendor' --exclude='node_modules' --exclude='.next' \
            --exclude='storage' --exclude='/bootstrap/cache/*.php' --exclude='__pycache__' \
            --exclude='*.sqlite*' --exclude='.bootstrap-*' \
            "$project/$directory/" "$build/$directory/"
    done
    runuser -u deploy -- env HOME="$deploy_home" PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin \
        bash -x "$build/deploy/bootstrap-apps.sh" "$build" "$root"
else
    echo 'Existing releases preserved; setup does not deploy updates or reseed.'
fi
systemctl start inventory-web.service inventory-queue.service inventory-scheduler.timer
systemctl is-active --quiet inventory-web.service
systemctl is-active --quiet inventory-queue.service
systemctl is-active --quiet inventory-scheduler.timer
runuser -u deploy -- curl --fail --silent --show-error --retry 15 --retry-delay 2 \
    --retry-all-errors --connect-timeout 2 --max-time 5 http://127.0.0.1/up >/dev/null
runuser -u deploy -- curl --fail --silent --show-error --retry 15 --retry-delay 2 \
    --retry-all-errors --connect-timeout 2 --max-time 5 http://127.0.0.1/login >/dev/null
set +x
printf '\nSetup verified. Web: http://%s/  API: http://%s/api\n' "$server_ip" "$server_ip"
printf 'Command log: %s\n' "$log"
if [[ -f $deploy_home/inventory-admin-credentials.txt ]]; then
    printf 'Admin credentials (read privately): %s/inventory-admin-credentials.txt\n' "$deploy_home"
fi
printf 'GitHub secrets to set:\nDEPLOY_HOST=%s\nDEPLOY_PORT=22\n' "$server_ip"
printf 'DEPLOY_SSH_KEY: contents of %s/.ssh/inventory_actions\n' "$deploy_home"
printf 'DEPLOY_KNOWN_HOSTS: contents of %s/.ssh/inventory_known_hosts\n' "$deploy_home"
echo 'Database imports are manual. Future releases: push the deploy branch.'
