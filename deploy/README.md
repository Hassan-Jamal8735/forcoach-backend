# FORCOACH — VPS Deployment Runbook

Target: Hostinger KVM 2 (Ubuntu 24.04 LTS, 2 vCPU / 8 GB RAM / 100 GB).

Final architecture — everything self-hosted on one VPS behind Caddy:

| Hostname | Serves | Container |
|---|---|---|
| `forcoach.io` | Next.js frontend (marketing + app) | `web` |
| `api.forcoach.io` | NestJS backend | `api` |
| `db.forcoach.io` | Supabase API gateway (auth + REST) | `kong` |
| _(not public)_ | Supabase Studio — reach via SSH tunnel | `studio` |

We run a **trimmed** Supabase stack. The app uses only Auth + Postgres/PostgREST,
so Realtime, Storage, imgproxy, and the analytics/vector services are all
skipped — that keeps memory use sane on an 8 GB box.

---

## ⚠️ Read before starting

1. **Fresh database — no data is migrated.** The only accounts today are Aya's
   and yours, so we start clean rather than carrying data across. You'll both
   sign up again, and Aya re-adds her studios and reconnects Google Calendar.
2. **SMTP is now mandatory.** Supabase cloud sent auth emails for us.
   Self-hosted, password resets and email confirmations break silently without
   working SMTP. See Step 5a — a normal Gmail password will **not** work.
3. **You now own backups.** Step 9 is not optional.
4. Keep Vercel + the old Supabase project alive until the VPS is verified, then
   decommission them.

---

## Step 1 — DNS (do this first; certificates depend on it)

In your DNS provider, point all of these at the VPS IP with **A** records:

```
forcoach.io        A   186.240.154.129
www.forcoach.io    A   186.240.154.129
api.forcoach.io    A   186.240.154.129
db.forcoach.io     A   186.240.154.129
```

Wait for propagation before Step 7. Verify: `dig +short forcoach.io`

> Leave Vercel alone for now — the old site keeps serving until DNS moves.

## Step 2 — Secure the server (running as root)

We run everything as `root`. Docker already grants host-root privileges, so a
separate sudo user buys less than it appears to here. The one risk that *is*
real: `root` is a known username, so a public IP attracts constant automated
password guessing. Key-only login removes that entirely.

**First, from your own machine**, install your SSH key on the server:

```bash
# If you don't have a key yet:
ssh-keygen -t ed25519 -C "forcoach-vps"

ssh-copy-id root@186.240.154.129
```

**Verify key login works before the next step** — open a *second* terminal and
confirm `ssh root@186.240.154.129` no longer prompts for a password. If you
disable password auth without a working key, you lock yourself out.

Then, on the server:

```bash
# Keep root login, but key-only (this is the important line)
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh

# Firewall — only SSH and web
ufw allow OpenSSH
ufw allow 80,443/tcp
ufw --force enable

# Unattended security patches + brute-force protection
apt update && apt install -y unattended-upgrades fail2ban
systemctl enable --now fail2ban
```

> Hostinger's browser Terminal still works even with password auth disabled, so
> you have a way back in if the key ever breaks.

## Step 3 — Verify Docker

Hostinger's Docker Manager template should already have it:

```bash
docker --version && docker compose version
```

If missing: `curl -fsSL https://get.docker.com | sh`


## Step 4 — Lay out the directories

```bash
mkdir -p /opt/forcoach
cd /opt/forcoach

git clone https://github.com/compilelogics-lgtm/forcoach.git
git clone https://github.com/compilelogics-lgtm/forcoach-backend.git

# Supabase self-hosted stack (we only keep the docker/ folder)
git clone --depth 1 https://github.com/supabase/supabase.git supabase-src
cp -r supabase-src/docker ./supabase
rm -rf supabase-src
```

Then copy this `deploy/` folder up from the project repo:

```bash
# from your machine
scp -r deploy root@186.240.154.129:/opt/forcoach/
```

Final layout:

```
/opt/forcoach/
├── forcoach/           # frontend repo
├── forcoach-backend/   # backend repo
├── supabase/           # supabase self-hosted compose
└── deploy/             # our compose + Caddyfile + .env
```

## Step 5 — Generate secrets and fill in `.env`

```bash
cd /opt/forcoach/deploy
cp .env.example .env

openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 24   # POSTGRES_PASSWORD
openssl rand -hex 24   # DASHBOARD_PASSWORD
```

`ANON_KEY` and `SERVICE_ROLE_KEY` are JWTs signed with `JWT_SECRET`. Generate
them with the key generator in the
[Supabase self-hosting docs](https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys)
(payloads: `{"role":"anon"}` and `{"role":"service_role"}`, 10-year expiry).

Then mirror the shared values into Supabase's own env file:

```bash
cd /opt/forcoach/supabase
cp .env.example .env
# Set at minimum: POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY,
# DASHBOARD_USERNAME, DASHBOARD_PASSWORD, and:
#   SITE_URL=https://forcoach.io
#   API_EXTERNAL_URL=https://db.forcoach.io
#   SUPABASE_PUBLIC_URL=https://db.forcoach.io
#   ADDITIONAL_REDIRECT_URLS=https://forcoach.io/auth/callback
#   DISABLE_SIGNUP=false
#   ENABLE_EMAIL_AUTOCONFIRM=false
#   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_SENDER_NAME / SMTP_ADMIN_EMAIL
# Google sign-in:
#   ENABLE_GOOGLE_SIGNUP=true (if supported by your compose version; otherwise
#   set GOTRUE_EXTERNAL_GOOGLE_* vars on the auth service directly)
#   GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID / _SECRET
#   GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://db.forcoach.io/auth/v1/callback
```

## Step 5a — Gmail SMTP (read carefully, this trips people up)

You're using `contact@forcoach.io` via Google. **The normal account password
will not work** — Google blocked plain-password SMTP. You need an *App Password*:

1. The account must have **2-Step Verification enabled** (App Passwords don't
   exist without it): Google Account → Security → 2-Step Verification.
2. Then go to Google Account → Security → **App passwords**, create one named
   "FORCOACH VPS", and copy the 16-character value.
3. Use these settings in **both** `.env` files:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=contact@forcoach.io
SMTP_PASS=<the 16-char app password, no spaces>
SMTP_ENCRYPTION=tls
SMTP_SENDER_NAME=FORCOACH
SMTP_ADMIN_EMAIL=contact@forcoach.io
```

> If `contact@forcoach.io` is a Google Workspace account, an admin may need to
> allow App Passwords for the org first.
>
> Gmail caps sending at ~500/day (2,000 on Workspace). Fine at this scale, but
> if FORCOACH grows, move to a transactional provider (Resend, Postmark, SES).

Test it before going further — a broken SMTP config fails *silently*:

```bash
docker exec -it supabase-auth env | grep -i smtp   # after Step 6
```

## Step 6 — Start Supabase and create the schema

```bash
cd /opt/forcoach/supabase

# Only the services we actually use (no Realtime/Storage/analytics).
docker compose up -d db kong auth rest meta studio

docker compose ps             # all healthy?
docker compose logs -f auth   # watch for startup errors, Ctrl-C when clean
```

Now create the FORCOACH tables. `deploy/schema.sql` is the consolidated final
state of all 8 migrations — tables, indexes, row-level security policies, and
triggers — flattened for a fresh install:

```bash
cd /opt/forcoach/deploy
docker cp schema.sql supabase-db:/tmp/schema.sql
docker exec -i supabase-db psql -U postgres -d postgres -f /tmp/schema.sql
```

Verify all 7 tables exist with RLS enabled:

```bash
docker exec -i supabase-db psql -U postgres -d postgres -c \
  "select tablename, rowsecurity from pg_tables
   where schemaname='public' order by tablename;"
```

Expect: `calendar_connections, events, ics_feeds, import_activity,
invoice_line_items, invoices, studios` — all with `rowsecurity = t`.

## Step 7 — Start the app stack

```bash
cd /opt/forcoach/deploy
docker network ls | grep supabase   # confirm the network name matches
                                    # `networks.forcoach.name` in the compose file
docker compose --env-file ./.env -f docker-compose.app.yml up -d --build
docker compose -f docker-compose.app.yml logs -f caddy   # watch cert issuance
```

Caddy will request Let's Encrypt certificates for all three hostnames. If this
fails, DNS hasn't propagated yet — wait and restart the caddy container.

## Step 8 — Update Google Cloud Console

Both OAuth flows need their redirect URIs updated **before** anyone uses them.

In **APIs & Services → Credentials**, on the relevant OAuth client:

- Authorized JavaScript origins: `https://forcoach.io`
- Authorized redirect URIs — add both:
  - `https://db.forcoach.io/auth/v1/callback` — Supabase Google sign-in
  - `https://api.forcoach.io/auth/google/callback` — our Calendar-read integration

Leave the old Vercel/Supabase-cloud URIs in place until you've verified the new
setup, then remove them.

## Step 9 — Backups (do not skip)

```bash
tee /etc/cron.daily/forcoach-backup >/dev/null <<'EOF'
#!/bin/bash
set -euo pipefail
mkdir -p /opt/forcoach/backups
STAMP=$(date +%F)
docker exec supabase-db pg_dump -U postgres postgres \
  | gzip > "/opt/forcoach/backups/forcoach-$STAMP.sql.gz"
find /opt/forcoach/backups -name '*.sql.gz' -mtime +30 -delete
EOF
chmod +x /etc/cron.daily/forcoach-backup
/etc/cron.daily/forcoach-backup   # run once now to verify it works
```

**Copy backups off the VPS too** — a backup that only exists on the machine it's
backing up is not a backup. Even a weekly `scp` to another location is enough.

## Step 10 — Verify before declaring done

- [ ] `https://forcoach.io` loads over HTTPS, purple accents on the marketing page
- [ ] Sign up a brand-new account → **confirmation email actually arrives**
- [ ] Password reset email arrives and the link works
- [ ] "Continue with Google" sign-in works
- [ ] Internal app is charcoal (not purple)
- [ ] Add a studio → appears in the list
- [ ] Connect Google Calendar → "Sync now" pulls events in
- [ ] Assign a class to a studio → Dashboard/Earnings totals update
- [ ] Create an invoice → Generate → **Download PDF returns a real PDF, not a
      `.json` file** (this was broken on the old stale backend — the rebuild
      here is what fixes it)
- [ ] Add an ICS feed → syncs
- [ ] Mobile viewport check on Calendar (no horizontal scrolling)

Only once all of the above pass: decommission Vercel, the old Hostinger
backend, and the Supabase cloud project.

---

## Operating it

```bash
# Deploy new code
cd /opt/forcoach/forcoach && git pull            # or forcoach-backend
cd /opt/forcoach/deploy
docker compose --env-file ./.env -f docker-compose.app.yml up -d --build

# Logs
docker compose -f docker-compose.app.yml logs -f api

# Supabase Studio (never expose publicly) — SSH tunnel from your machine:
ssh -L 3000:localhost:3000 root@186.240.154.129
# then open http://localhost:3000
```

### Known gotchas

- `NEXT_PUBLIC_*` values are **baked in at build time**. Changing them requires
  `--build`, not just a restart.
- The backend talks to Supabase at `http://kong:8000` over the internal Docker
  network — that's intentional and should not be changed to the public URL.
- If Caddy can't get certificates, it's nearly always DNS. Check
  `dig +short <hostname>` before debugging anything else.
