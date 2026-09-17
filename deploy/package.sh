#!/usr/bin/env bash
set -Eeuo pipefail

component=${1:?Usage: package.sh api|web RELEASE_ID OUTPUT_DIR}
release=${2:?Release ID required}
output=${3:?Output directory required}
[[ $component == api || $component == web ]] || { echo 'Invalid component' >&2; exit 1; }
[[ $release =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$ ]] || { echo 'Invalid release ID' >&2; exit 1; }
project=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
mkdir -p "$output"
output=$(cd "$output" && pwd)
archive="$component-$release.tar.gz"

if [[ $component == api ]]; then
    test -f "$project/inventory-api/vendor/autoload.php"
    tar -czf "$output/$archive" -C "$project/inventory-api" \
        --exclude='./.env*' --exclude='./.git' --exclude='./node_modules' \
        --exclude='./tests' --exclude='./storage' --exclude='./public/storage' \
        --exclude='./bootstrap/cache/*.php' --exclude='./database/*.sqlite*' \
        --exclude='./.phpunit*' .
else
    test -f "$project/web/.next/standalone/server.js"
    staging=$(mktemp -d)
    trap 'rm -rf "$staging"' EXIT
    # Next's standalone server does not copy these assets itself.
    cp -a "$project/web/.next/standalone/." "$staging/"
    mkdir -p "$staging/.next"
    cp -a "$project/web/.next/static" "$staging/.next/static"
    if [[ -d $project/web/public ]]; then
        cp -a "$project/web/public" "$staging/public"
    fi
    tar -czf "$output/$archive" -C "$staging" --exclude='.env*' .
fi
(cd "$output" && sha256sum "$archive" > "$archive.sha256")
printf 'Packaged %s\n' "$output/$archive"
