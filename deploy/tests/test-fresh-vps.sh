#!/usr/bin/env bash
# Destructive only inside the disposable container named below. Run from repo root.
set -Eeuo pipefail
name="inventory-bootstrap-test-$$"
image="inventory-bootstrap-test:local"
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
docker build -f deploy/tests/ubuntu.Dockerfile -t "$image" .
docker run --privileged --cgroupns=host --tmpfs /run --tmpfs /run/lock --tmpfs /tmp \
    -v /sys/fs/cgroup:/sys/fs/cgroup:rw -v "$PWD:/project:ro" --name "$name" -d "$image"
for attempt in {1..30}; do
    if docker exec "$name" test -d /run/systemd/system; then break; fi
    sleep 1
done
docker exec "$name" bash /project/deploy/setup-server.sh 192.0.2.10
docker exec "$name" bash -euo pipefail -c '
    cd /var/www/inventory-deploy
    sha256sum shared/api.env /home/deploy/.ssh/inventory_actions /home/deploy/inventory-admin-credentials.txt > /tmp/before.sha256
    readlink api/current > /tmp/api-before
    readlink web/current > /tmp/web-before
    runuser -u deploy -- sh -c "echo persistent > /var/www/inventory-deploy/shared/storage/app/public/bootstrap-test.txt"
    mysql -e "CREATE TABLE inventory_production.bootstrap_test (value VARCHAR(20)); INSERT INTO inventory_production.bootstrap_test VALUES ('\''preserved'\'');"
    test "$(systemctl show inventory-web -p User --value)" = deploy
    test "$(systemctl show inventory-queue -p User --value)" = deploy
    test "$(stat -c %a /home/deploy/inventory-admin-credentials.txt)" = 600
    test -f shared/.bootstrap-initialized
'
docker exec "$name" bash /project/deploy/setup-server.sh 192.0.2.10
docker exec "$name" bash -euo pipefail -c '
    cd /var/www/inventory-deploy
    sha256sum --check /tmp/before.sha256
    test "$(readlink api/current)" = "$(cat /tmp/api-before)"
    test "$(readlink web/current)" = "$(cat /tmp/web-before)"
    test "$(mysql -NBe "SELECT value FROM inventory_production.bootstrap_test")" = preserved
    test "$(curl -fsS http://127.0.0.1/storage/bootstrap-test.txt)" = persistent
    curl -fsS http://127.0.0.1/up >/dev/null
    curl -fsS http://127.0.0.1/login >/dev/null
    runuser -u deploy -- ssh -i /home/deploy/.ssh/inventory_actions -o BatchMode=yes -o IdentitiesOnly=yes \
      -o HostKeyAlias=192.0.2.10 -o StrictHostKeyChecking=yes \
      -o UserKnownHostsFile=/home/deploy/.ssh/inventory_known_hosts deploy@127.0.0.1 test "\$(id -un)" = deploy
'
echo 'Fresh Ubuntu setup and preservation on rerun passed.'
