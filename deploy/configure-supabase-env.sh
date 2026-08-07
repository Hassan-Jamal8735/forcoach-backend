#!/usr/bin/env bash
# Fills in /opt/forcoach/supabase/.env from the upstream template.
#
# Reads the shared secrets from /opt/forcoach/deploy/.env so JWT_SECRET,
# ANON_KEY, SERVICE_ROLE_KEY and POSTGRES_PASSWORD are guaranteed identical on
# both sides — a mismatch there produces "invalid JWT" errors that look like
# something else entirely.
#
# Generates fresh random values for the remaining Supabase-internal secrets so
# nothing is left sitting at an upstream default.
#
# Safe to re-run: it rebuilds .env from .env.example each time.

set -euo pipefail

DEPLOY_ENV=/opt/forcoach/deploy/.env
SB_DIR=/opt/forcoach/supabase

[[ -f "$DEPLOY_ENV" ]]        || { echo "ERROR: $DEPLOY_ENV not found"; exit 1; }
[[ -f "$SB_DIR/.env.example" ]] || { echo "ERROR: $SB_DIR/.env.example not found"; exit 1; }

export DEPLOY_ENV SB_DIR
export SECRET_KEY_BASE="$(openssl rand -hex 32)"
export VAULT_ENC_KEY="$(openssl rand -hex 16)"        # exactly 32 chars
export PG_META_CRYPTO_KEY="$(openssl rand -hex 32)"
export REALTIME_DB_ENC_KEY="$(openssl rand -hex 8)"   # 16 chars
export LOGFLARE_PUBLIC_ACCESS_TOKEN="$(openssl rand -hex 16)"
export LOGFLARE_PRIVATE_ACCESS_TOKEN="$(openssl rand -hex 16)"
export MINIO_ROOT_PASSWORD="$(openssl rand -hex 16)"

python3 - <<'PY'
import os, re, io, sys

deploy_env = os.environ['DEPLOY_ENV']
sb_dir     = os.environ['SB_DIR']

def read_env(path):
    out = {}
    with io.open(path, encoding='utf-8') as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            out[k.strip()] = v
    return out

app = read_env(deploy_env)

def need(key):
    v = app.get(key, '')
    if not v:
        sys.exit("ERROR: %s is empty in %s" % (key, deploy_env))
    return v

overrides = {
    # shared with the app — these MUST match exactly
    'POSTGRES_PASSWORD':  need('POSTGRES_PASSWORD'),
    'JWT_SECRET':         need('JWT_SECRET'),
    'ANON_KEY':           need('ANON_KEY'),
    'SERVICE_ROLE_KEY':   need('SERVICE_ROLE_KEY'),
    'DASHBOARD_USERNAME': app.get('DASHBOARD_USERNAME', 'admin'),
    'DASHBOARD_PASSWORD': need('DASHBOARD_PASSWORD'),

    # public URLs
    'SITE_URL':                 'https://forcoach.io',
    'API_EXTERNAL_URL':         'https://db.forcoach.io',
    'SUPABASE_PUBLIC_URL':      'https://db.forcoach.io',
    'ADDITIONAL_REDIRECT_URLS': 'https://forcoach.io/auth/callback',

    # Bind Kong to loopback only. Docker publishes ports straight into iptables,
    # which BYPASSES ufw — left at the default these would be open to the
    # internet. Caddy reaches Kong over the Docker network instead, so nothing
    # needs to be published publicly.
    'KONG_HTTP_PORT':  '127.0.0.1:8000',
    'KONG_HTTPS_PORT': '127.0.0.1:8443',

    # auth behaviour
    'DISABLE_SIGNUP':           'false',
    'ENABLE_EMAIL_SIGNUP':      'true',
    'ENABLE_EMAIL_AUTOCONFIRM': 'false',
    'ENABLE_PHONE_SIGNUP':      'false',
    'ENABLE_PHONE_AUTOCONFIRM': 'false',
    'ENABLE_ANONYMOUS_USERS':   'false',
    'JWT_EXPIRY':               '3600',

    # mail
    'SMTP_HOST':        app.get('SMTP_HOST', ''),
    'SMTP_PORT':        app.get('SMTP_PORT', '587'),
    'SMTP_USER':        app.get('SMTP_USER', ''),
    'SMTP_PASS':        app.get('SMTP_PASS', ''),
    'SMTP_SENDER_NAME': app.get('SMTP_SENDER_NAME', 'FORCOACH'),
    'SMTP_ADMIN_EMAIL': app.get('SMTP_ADMIN_EMAIL', ''),

    # supabase-internal secrets
    'SECRET_KEY_BASE':               os.environ['SECRET_KEY_BASE'],
    'VAULT_ENC_KEY':                 os.environ['VAULT_ENC_KEY'],
    'PG_META_CRYPTO_KEY':            os.environ['PG_META_CRYPTO_KEY'],
    'REALTIME_DB_ENC_KEY':           os.environ['REALTIME_DB_ENC_KEY'],
    'LOGFLARE_PUBLIC_ACCESS_TOKEN':  os.environ['LOGFLARE_PUBLIC_ACCESS_TOKEN'],
    'LOGFLARE_PRIVATE_ACCESS_TOKEN': os.environ['LOGFLARE_PRIVATE_ACCESS_TOKEN'],
    'MINIO_ROOT_PASSWORD':           os.environ['MINIO_ROOT_PASSWORD'],

    # studio cosmetics
    'STUDIO_DEFAULT_ORGANIZATION': 'FORCOACH',
    'STUDIO_DEFAULT_PROJECT':      'FORCOACH',

    # Consumed by docker-compose.override.yml to enable Google sign-in.
    # Upstream's compose does not pass these to the auth service on its own.
    'GOOGLE_CLIENT_ID':     app.get('GOOGLE_CLIENT_ID', ''),
    'GOOGLE_CLIENT_SECRET': app.get('GOOGLE_CLIENT_SECRET', ''),
}

src = io.open(os.path.join(sb_dir, '.env.example'), encoding='utf-8').read()
seen = set()
out_lines = []
for line in src.splitlines():
    m = re.match(r'^([A-Z0-9_]+)=', line)
    if m and m.group(1) in overrides:
        k = m.group(1)
        out_lines.append('%s=%s' % (k, overrides[k]))
        seen.add(k)
    else:
        out_lines.append(line)

missing = [k for k in overrides if k not in seen]
if missing:
    out_lines.append('')
    out_lines.append('# --- added by configure-supabase-env.sh ---')
    for k in missing:
        out_lines.append('%s=%s' % (k, overrides[k]))

io.open(os.path.join(sb_dir, '.env'), 'w', encoding='utf-8').write('\n'.join(out_lines) + '\n')
print('Wrote %s/.env  (%d overrides applied, %d appended)' % (sb_dir, len(seen), len(missing)))
PY

chmod 600 "$SB_DIR/.env"

echo
echo "--- shared values identical in both .env files? ---"
for k in JWT_SECRET ANON_KEY SERVICE_ROLE_KEY POSTGRES_PASSWORD DASHBOARD_PASSWORD; do
  a=$(grep -E "^$k=" "$DEPLOY_ENV"  | head -1 | cut -d= -f2-)
  b=$(grep -E "^$k=" "$SB_DIR/.env" | head -1 | cut -d= -f2-)
  if [[ -n "$a" && "$a" == "$b" ]]; then echo "  $k: MATCH"; else echo "  $k: *** MISMATCH ***"; fi
done

echo
echo "--- required keys still empty? ---"
if grep -qE "^(JWT_SECRET|ANON_KEY|SERVICE_ROLE_KEY|POSTGRES_PASSWORD|SECRET_KEY_BASE|VAULT_ENC_KEY|SITE_URL|API_EXTERNAL_URL|SUPABASE_PUBLIC_URL)=$" "$SB_DIR/.env"; then
  echo "  ^^ EMPTY keys listed above — fix before starting"
  exit 1
else
  echo "  none — all set"
fi
