#!/bin/bash
# Bring the AMANOR dev stack up locally.
#
# NOTE: The API needs MongoDB reachable on host port 27029. That port is served
# by the `amanor-dev-mongo` Docker container. If the API logs
# "ECONNREFUSED 127.0.0.1:27029" while `docker ps` shows the container running
# and mapped, Docker Desktop's port-forwarding proxy is wedged (a known macOS
# issue where newly-created container ports stop reaching the host). Fix:
#   1) Restart Docker Desktop fully (Quit, reopen, wait for the whale icon).
#   2) The container auto-starts (restart policy = unless-stopped).
#   3) Re-run this script.
#
# Public web and admin run natively (no Docker) and do not need Mongo to render;
# they degrade gracefully to "awaiting approved record" states when the API is
# down.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== 1/4 dev Mongo (27029) =="
docker start amanor-dev-mongo >/dev/null 2>&1 || echo "  (container missing — recreate with scripts/mongo-bootstrap if needed)"
for i in $(seq 1 20); do
  if nc -z -G 2 127.0.0.1 27029 2>/dev/null; then echo "  host 27029 reachable"; break; fi
  sleep 1
  [ "$i" = 20 ] && echo "  WARNING: 27029 not reachable from host — restart Docker Desktop (see header)."
done

echo "== 2/4 API (:4000) =="
[ -f apps/api/.env ] || cp apps/api/.env.codex-isolated-74393 apps/api/.env
(cd apps/api && nohup npm run dev >/tmp/amanor-api-dev.log 2>&1 &) ; echo "  API starting (log: /tmp/amanor-api-dev.log)"

echo "== 3/4 public web (:3010) =="
(cd apps/web && nohup npx next dev -p 3010 >/tmp/amanor-web-dev.log 2>&1 &) ; echo "  web -> http://localhost:3010/"

echo "== 4/4 admin (:3012) =="
(cd apps/admin && nohup npx next dev -p 3012 >/tmp/amanor-admin-dev.log 2>&1 &) ; echo "  admin -> http://localhost:3012/"

echo "Done. Default ports 3000/3001 are used by other projects on this machine, so web/admin run on 3010/3012."
