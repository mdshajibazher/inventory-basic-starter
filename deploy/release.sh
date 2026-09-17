#!/usr/bin/env bash
set -Eeuo pipefail
umask 0027

# This script is streamed over SSH and always runs without root privileges.
[[ $(id -un) == deploy && $(id -u) != 0 ]] || { echo 'Run deployment as deploy, never root.' >&2; exit 1; }
mode=deploy
if [[ ${1:-} == rollback ]]; then mode=rollback; shift; fi
component=${1:?Usage: release.sh [rollback] api|web RELEASE_ID}
release=${2:?Release ID required}
[[ $component == api || $component == web ]] || { echo 'Invalid component' >&2; exit 1; }
[[ $release =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$ ]] || { echo 'Invalid release ID' >&2; exit 1; }
root=${INVENTORY_DEPLOY_ROOT:-/var/www/inventory-deploy}
test -d "$root/incoming"
exec 9>"$root/.deploy.lock"
flock -w 300 9
target="$root/$component/releases/$release"
current="$root/$component/current"
previous=$(readlink -e "$current" || true)
switched=0

switch_to() {
    ln -s "$1" "$current.next.$$"
    mv -Tf "$current.next.$$" "$current"
}

restart_services() {
    if [[ $component == api ]]; then
        sudo -n /usr/bin/systemctl reload php8.3-fpm.service
        sudo -n /usr/bin/systemctl restart inventory-queue.service
        sudo -n /usr/bin/systemctl start inventory-scheduler.timer
    else
        sudo -n /usr/bin/systemctl restart inventory-web.service
    fi
}

failed() {
    local status=$1
    trap - ERR INT TERM
    set +e
    if [[ $switched == 1 ]]; then
        if [[ -n $previous && -d $previous ]]; then
            switch_to "$previous"
            restart_services
            echo "Restored previous $component code: $previous" >&2
        else
            unlink "$current"
            if [[ $component == api ]]; then
                sudo -n /usr/bin/systemctl stop inventory-queue.service
                sudo -n /usr/bin/systemctl stop inventory-scheduler.timer
            else
                sudo -n /usr/bin/systemctl stop inventory-web.service
            fi
            echo "First $component activation failed; no previous release exists." >&2
        fi
    fi
    echo "Deployment failed. Database migrations were NOT reversed." >&2
    exit "$status"
}
trap 'failed $?' ERR
trap 'failed 130' INT
trap 'failed 143' TERM

if [[ $mode == deploy ]]; then
    test ! -e "$target"
    archive="$component-$release.tar.gz"
    (
        cd "$root/incoming"
        # Only accept a checksum for this exact artifact, never a supplied path.
        read -r digest filename < "$archive.sha256"
        [[ $digest =~ ^[a-f0-9]{64}$ && $filename == "$archive" ]]
        printf '%s  %s\n' "$digest" "$archive" | sha256sum --check --strict -
    )
    mkdir -p "$target"
    tar -xzf "$root/incoming/$archive" -C "$target" --no-same-owner
    if [[ $component == api ]]; then
        test -f "$root/shared/api.env"
        test -d "$root/shared/storage"
        ln -s "$root/shared/api.env" "$target/.env"
        ln -s "$root/shared/storage" "$target/storage"
        mkdir -p "$target/bootstrap/cache"
        chmod 2770 "$target/bootstrap/cache"
        cd "$target"
        composer check-platform-reqs --no-dev
        php artisan migrate --force --no-interaction
        php artisan storage:link --no-interaction
        php artisan config:cache --no-interaction
        php artisan route:cache --no-interaction
        php artisan view:cache --no-interaction
    else
        test -f "$target/server.js"
    fi
    touch "$target/.ready"
else
    # Rollback only switches already prepared code; it never runs migrations.
    test -f "$target/.ready"
fi

switched=1
switch_to "$target"
restart_services
if [[ $component == api ]]; then
    curl --fail --silent --show-error --retry 15 --retry-delay 2 --retry-all-errors \
        --connect-timeout 2 --max-time 5 http://127.0.0.1/up > /dev/null
else
    curl --fail --silent --show-error --retry 15 --retry-delay 2 --retry-all-errors \
        --connect-timeout 2 --max-time 5 http://127.0.0.1:3000/login > /dev/null
fi
trap - ERR INT TERM
printf 'Activated %s release %s as %s\n' "$component" "$release" "$(id -un)"
