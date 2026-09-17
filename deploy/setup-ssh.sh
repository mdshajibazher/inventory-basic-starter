#!/usr/bin/env bash
# Run once as deploy, not from Actions. Never print the generated private key.
set -Eeuo pipefail
umask 0077
[[ $(id -un) == deploy && $(id -u) != 0 ]] || { echo 'Run as deploy.' >&2; exit 1; }
host=${1:?Usage: bash deploy/setup-ssh.sh SERVER_IPV4}
python3 -c 'import ipaddress,sys; ipaddress.IPv4Address(sys.argv[1])' "$host"
install -d -m 0700 "$HOME/.ssh"
key="$HOME/.ssh/inventory_actions"
if [[ ! -f $key ]]; then
    ssh-keygen -q -t ed25519 -N '' -C inventory-github-actions -f "$key"
fi
touch "$HOME/.ssh/authorized_keys"
chmod 0600 "$HOME/.ssh/authorized_keys"
entry="restrict $(cat "$key.pub")"
if ! grep -qxF "$entry" "$HOME/.ssh/authorized_keys"; then
    printf '\n%s\n' "$entry" >> "$HOME/.ssh/authorized_keys"
fi
awk -v host="$host" '{ print host, $1, $2 }' /etc/ssh/ssh_host_ed25519_key.pub > "$HOME/.ssh/inventory_known_hosts"
printf 'Key prepared for deploy. GitHub secret source files:\n%s\n%s\n' "$key" "$HOME/.ssh/inventory_known_hosts"
