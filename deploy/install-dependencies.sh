#!/usr/bin/env bash
# Called only by administrator setup, never by GitHub Actions.
set -Eeuo pipefail
[[ $(id -u) == 0 ]] || { echo 'Package installation requires an administrator.' >&2; exit 1; }
umask 0022
export DEBIAN_FRONTEND=noninteractive
packages=(nginx mysql-server git curl ca-certificates gnupg unzip acl python3 rsync sudo
    openssh-client openssh-server util-linux software-properties-common
    php8.3-cli php8.3-fpm php8.3-mysql php8.3-sqlite3 php8.3-mbstring php8.3-xml
    php8.3-curl php8.3-zip php8.3-bcmath php8.3-intl php8.3-gd composer)
missing=()
for package in "${packages[@]}"; do
    if [[ $(dpkg-query -W -f='${Status}' "$package" 2>/dev/null || true) != 'install ok installed' ]]; then
        missing+=("$package")
    fi
done
if (( ${#missing[@]} )); then
    apt-get update
    apt-get install -y ca-certificates curl gnupg software-properties-common
    add-apt-repository -y universe
    apt-get update
    apt-get install -y "${missing[@]}"
fi

if ! command -v node >/dev/null || [[ $(node -p 'process.versions.node.split(".")[0]') != 24 ]]; then
    nodesource_script=$(mktemp)
    trap 'rm -f "$nodesource_script"' EXIT
    curl --fail --silent --show-error --location --retry 3 \
        https://deb.nodesource.com/setup_24.x -o "$nodesource_script"
    bash "$nodesource_script"
    apt-get install -y nodejs
fi

php -r 'if (PHP_MAJOR_VERSION !== 8 || PHP_MINOR_VERSION !== 3) { fwrite(STDERR, "PHP CLI must be 8.3. Check the php alternative.\n"); exit(1); }
foreach (["ctype","curl","dom","fileinfo","gd","intl","mbstring","pdo_mysql","pdo_sqlite","sqlite3","tokenizer","xml","zip","bcmath","pcntl","posix"] as $extension) {
    if (!extension_loaded($extension)) { fwrite(STDERR, "Missing PHP extension: $extension\n"); exit(1); }
}'
[[ $(node -p 'process.versions.node.split(".")[0]') == 24 ]] || { echo 'Node.js 24 installation failed; check the nodejs package version.' >&2; exit 1; }
composer --version --no-ansi | grep -Eq '^Composer version 2\.'
npm --version
php -v
node --version
systemctl enable --now nginx mysql php8.3-fpm ssh
