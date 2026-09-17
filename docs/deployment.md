# Deploying inventory-api and web

Push to **`deploy`** to validate and deploy both projects. The API deploys first; the web deployment runs only after API deployment succeeds. Both validation jobs must pass before either live app changes. Other branches do not deploy. Runs are serialized; an active deployment is not cancelled by a newer push.

## This server

| Item | Value |
| --- | --- |
| Web | `http://104.251.219.254/` |
| API | `http://104.251.219.254/api` |
| Laravel health | `http://104.251.219.254/up` |
| SSH account | `deploy` |
| SSH port | `22` |
| Source repository | `/var/www/inventory-basic-starter` |
| Live API | `/var/www/inventory-deploy/api/current` |
| Live web | `/var/www/inventory-deploy/web/current` |
| Laravel environment | `/var/www/inventory-deploy/shared/api.env` |
| Uploads, logs, sessions, views | `/var/www/inventory-deploy/shared/storage` |
| MySQL database | `inventory_production` |
| MySQL account | `inventory_app` at `127.0.0.1` |

The source checkout is separate from live releases. Deployments upload build artifacts; the server does not pull GitHub or need a GitHub repository key. Database credentials and the Laravel key stay on this server. HTTP/IP hosting is the initial configuration; domain/TLS setup is separate.

**Accounts:** Actions builds run on GitHub-hosted runners. Every connection to this server is hard-coded to `deploy`. The release script refuses root. Next.js, queue workers and the scheduler run as `deploy`; PHP-FPM handles requests as `www-data`. Root is used only for initial system configuration. The sudoers file permits exactly the named service operations, not arbitrary `sudo`, shell commands, service files, or package installation.

## Activate GitHub Actions

Open the repository's **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
| --- | --- |
| `DEPLOY_HOST` | `104.251.219.254` |
| `DEPLOY_PORT` | `22` (optional; defaults to 22) |
| `DEPLOY_SSH_KEY` | Complete contents of `/home/deploy/.ssh/inventory_actions` |
| `DEPLOY_KNOWN_HOSTS` | Complete contents of `/home/deploy/.ssh/inventory_known_hosts` |

There is deliberately no `DEPLOY_USER` secret. The workflow always uses `deploy`.

Read the two files in your own SSH terminal, then paste them into the matching GitHub secrets. Do not put them in Git, chat, or this command log:

```bash
ssh deploy@104.251.219.254
cat ~/.ssh/inventory_actions
cat ~/.ssh/inventory_known_hosts
```

The public key is already authorized for `deploy`, with forwarding and PTY disabled. The known-host record comes from this server's actual host public key, not an unverified CI-time `ssh-keyscan`. If the SSH port changes, update both `DEPLOY_PORT` and the known-host entry to `[104.251.219.254]:PORT`.

After the deployment changes are committed in your working copy, push that commit to the deployment branch:

```bash
git push origin HEAD:deploy
```

Do not force-push if Git reports that the remote branch has newer commits; fetch and reconcile them first. Watch the **Deploy inventory** workflow in GitHub's Actions tab. Once a workflow is available for manual dispatch, select branch `deploy`. To retry a release, rerun **all jobs**, because release/artifact names include the run attempt and failed-jobs-only reruns cannot reuse old attempt artifacts.

The server has been smoke-tested locally; the first actual GitHub run is the end-to-end check of repository secrets and runner-to-server connectivity.

## Set up a new VPS

Use a fresh **Ubuntu 24.04 x86_64 VPS booted with systemd**, with Internet access and the complete repository copied or cloned onto it. Allow inbound SSH (22) and HTTP (80) in your provider firewall. Domain names and HTTPS need separate configuration.

Run as an administrator, replacing the example IP with the new VPS public IPv4 address:

```bash
cd /var/www/inventory-basic-starter
sudo bash deploy/setup-server.sh 104.251.219.254
```

The script installs Nginx, MySQL, PHP 8.3 and required extensions, Composer 2, Node.js 24, and deployment utilities. It creates the `deploy` user if needed, configures permissions, database credentials, Laravel environment/key, Nginx, systemd services, and restricted sudo access. It calls `setup-ssh.sh` automatically to create the Actions key and known-host file while preserving existing authorized keys.

Composer installation, the Next.js build, release activation, migrations, and first-time seeding run as **deploy**. On a new database, setup runs the default seeder once and replaces the default admin password with a random password. The `--force` option allows Artisan to run in production without an interactive prompt; it does not reset the database. Setup checks both applications before reporting success.

Read `/home/deploy/inventory-admin-credentials.txt` privately and change the account details after signing in. The file has mode `0600`. Set the four GitHub secrets listed above using the **new server's** address and generated files. Setting GitHub secrets, importing old data, DNS/TLS, and provider firewall rules remain manual.

### Reruns and recovery

Rerunning the same command preserves the environment, passwords, SSH keys, database, uploads, and ready releases. It does not deploy source changes or reseed an existing installation. Failed initial setup can be retried after correcting the reported error; pending database credentials and initialization credentials are reused. If a database or database user already exists without the saved environment or pending provisioning state, setup refuses to overwrite it. Restore the matching environment/backup before proceeding.

Existing application users are preserved. If you intend to import a database, import it manually and preserve its original `APP_KEY` where encrypted data depends on it. Back up the database and shared storage before modifying an existing installation. Mail defaults to Laravel's `log` mailer; configure a mail provider in the shared environment for email delivery.

Root installs packages and system configuration. Routine deployment and Artisan commands use `deploy`:

```bash
sudo -iu deploy
cd /var/www/inventory-deploy/api/current
php artisan migrate:status
```

`setup-ssh.sh` can also be run separately as `deploy` to regenerate a missing SSH setup or update the known-host address. You do not need to call it separately after successful server setup.

Every setup invocation writes a private command/output log under `/var/log/inventory-setup/`. The [original command log](deployment-command-log.md) and [installer implementation command log](setup-server-command-log.md) record work performed during these sessions; they are audit records, not scripts to replay.

### Installer verification

The `Test fresh VPS setup` workflow runs on relevant pushes to `master`. It installs into a disposable Ubuntu 24.04 systemd container, checks HTTP and deployment SSH access, then reruns setup and verifies that credentials, releases, uploaded files, and database data remain unchanged. Run it manually from Actions, or locally on a disposable Docker host:

```bash
bash deploy/tests/test-fresh-vps.sh
```

The integration test uses a privileged container and a writable cgroup mount. Use a dedicated test host. Unit tests run with `python3 -B -m unittest discover -s deploy/tests`; install the API Composer dependencies first to include the real Laravel initialization tests.

## Manual deployment and rollback

Normal deployments require only a Git push. For manual recovery, use the same scripts as CI. Build from the repository on **Ubuntu 24.04 x86_64 with PHP 8.3 and Node 24**, matching this server and the GitHub runner. Next.js standalone artifacts contain native dependencies; macOS/ARM builds are not interchangeable. The commands below alter only dependencies/build output:

```bash
cd inventory-api
composer install --no-dev --prefer-dist --no-interaction --optimize-autoloader
cd ../web
npm ci --no-audit --no-fund
NEXT_PUBLIC_API_URL=/api npm run build
cd ..
release_id="$(git rev-parse HEAD)-manual-$(date -u +%Y%m%d%H%M%S)"
bash deploy/package.sh api "$release_id" /tmp/inventory-packages
bash deploy/package.sh web "$release_id" /tmp/inventory-packages
scp /tmp/inventory-packages/*"$release_id"* deploy@104.251.219.254:/var/www/inventory-deploy/incoming/
ssh deploy@104.251.219.254 "bash -s -- api $release_id" < deploy/release.sh
ssh deploy@104.251.219.254 "bash -s -- web $release_id" < deploy/release.sh
```

Use a fresh release ID each time; existing releases are never overwritten. Deployments keep previous release directories and incoming packages for manual recovery. Monitor disk space and remove obsolete releases deliberately, retaining `current` and your chosen rollback release.

To roll back, list releases and select a previous directory name:

```bash
ls /var/www/inventory-deploy/api/releases
ls /var/www/inventory-deploy/web/releases
cd /var/www/inventory-basic-starter
bash deploy/release.sh rollback api PREVIOUS_RELEASE_ID
bash deploy/release.sh rollback web PREVIOUS_RELEASE_ID
```

Rollback only switches prepared code and restarts services. It does **not** reverse database migrations or restore a database backup. Write migrations compatible with both the previous and new code. If web deployment fails after API succeeded, the API remains at its new release while web returns to its prior release; both projects must tolerate that transition. Brief service restart downtime is expected.

## Checks and logs

As `deploy`:

```bash
whoami
readlink -f /var/www/inventory-deploy/api/current
readlink -f /var/www/inventory-deploy/web/current
systemctl is-active inventory-web inventory-queue inventory-scheduler.timer
systemctl show inventory-web inventory-queue -p User -p Group -p MainPID
curl -f http://127.0.0.1/up
curl -I http://127.0.0.1/login
curl -i -H 'Accept: application/json' http://127.0.0.1/api/me
tail -n 100 /var/www/inventory-deploy/shared/storage/logs/laravel.log
cd /var/www/inventory-deploy/api/current
php artisan migrate:status
php artisan queue:failed
```

Unauthenticated `/api/me` should return **401**, while `/up` and `/login` return **200**. Uploaded files use `/storage/...`.

An administrator can inspect system logs/configuration:

```bash
sudo nginx -t
sudo journalctl -u inventory-web -u inventory-queue -u inventory-scheduler --since '30 minutes ago'
sudo tail -n 100 /var/log/nginx/error.log
sudo -l -U deploy
```

For a runtime environment change, edit the shared environment file as deploy and redeploy. Do not regenerate `APP_KEY`. Back up MySQL and shared storage before application changes that alter data.

The workflow, release scripts, setup scripts, and this guide are the reusable record. The command log records this particular setup session, including diagnostic failures and retries; do not blindly replay it as a setup script.
