#!/usr/bin/env bash
# SOURCE is a disposable snapshot owned by deploy, never the user's checkout.
set -Eeuo pipefail
umask 0027
[[ $(id -un) == deploy && $(id -u) != 0 ]] || { echo 'Build and activation must run as deploy.' >&2; exit 1; }
source_dir=${1:?Source snapshot directory required}
root=${2:?Deployment root required}
export INVENTORY_DEPLOY_ROOT="$root"
api_needed=1
web_needed=1
[[ ! -f $root/api/current/.ready ]] || api_needed=0
[[ ! -f $root/web/current/.ready ]] || web_needed=0
if (( ! api_needed && ! web_needed )); then
    echo 'Both components are already installed; preserving active releases.'
    exit 0
fi
for component in api web; do
    if [[ -e $root/$component/current || -L $root/$component/current ]]; then
        test -f "$root/$component/current/.ready" || { echo "Invalid $component current release; repair it before rerunning setup." >&2; exit 1; }
    fi
done
release="bootstrap-$(date -u +%Y%m%d%H%M%S)-$$"
if (( api_needed )); then
    cd "$source_dir/inventory-api"
    mkdir -p bootstrap/cache storage/framework/{cache/data,sessions,views} storage/logs
    composer install --no-dev --prefer-dist --no-interaction --no-progress --optimize-autoloader
    if [[ -f $root/shared/.bootstrap-database ]]; then
        cp "$source_dir/deploy/initialize-app.php" .bootstrap-initialize.php
    fi
    bash "$source_dir/deploy/package.sh" api "$release" "$root/incoming"
fi
if (( web_needed )); then
    cd "$source_dir/web"
    npm ci --no-audit --no-fund
    NEXT_PUBLIC_API_URL=/api NEXT_TELEMETRY_DISABLED=1 npm run build
    bash "$source_dir/deploy/package.sh" web "$release" "$root/incoming"
fi

# No component is activated until every required build has succeeded.
if (( api_needed )); then
    options=()
    if [[ -f $root/shared/.bootstrap-database ]]; then options+=(--initialize); fi
    bash "$source_dir/deploy/release.sh" api "$release" "${options[@]}"
fi
if (( web_needed )); then
    bash "$source_dir/deploy/release.sh" web "$release"
fi
