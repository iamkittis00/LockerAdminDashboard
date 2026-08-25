# locker-admin

Production locker dashboard — React (Vite) frontend + FastAPI backend, MySQL, MQTT.
Runs behind nginx at `locker-admin.donaus-dev.net`; the API runs as `locker-api.service`.

## Deploying

**Read [DEPLOY.md](DEPLOY.md) before any deploy-related work, and follow it rather than
improvising SSH commands.** Deploying means running the pipeline in
[.github/workflows/deploy.yml](.github/workflows/deploy.yml) — push to `main`, or run the
workflow by hand from the Actions tab.

This is a **shape B** deploy (app server + systemd), not a static SPA: it restarts a live
service, so it is gated on tests and verified with a healthcheck. Do not hand-copy the
static-site deploy recipe from other projects onto this one.

Never deploy the server's `.env`. Production secrets live only on the server; the pipeline
excludes `.env` on purpose. Adding a new required env var means SSHing in to set it on the
server *first* — the backend fails fast on a missing var, which will fail the healthcheck.

## Conventions specific to this codebase

- **Never return `401` for a business-logic validation failure inside an already-authenticated
  endpoint** — the frontend's `request()` treats any 401 on an authenticated call as "token is
  dead" and force-logs the user out. Use `400`. `401` means "this request's token is invalid",
  nothing else. (`/api/login` returning 401 for bad credentials is fine — it's called with
  `auth: false`.)
- Every `get_db_connection()` call site needs an `if not conn` guard and `try/finally` around
  cursor/connection cleanup — a leaked connection per failed query eventually exhausts the pool.
- The DB uses `autocommit=True`, so a multi-statement operation can half-apply if a later
  statement throws. Verify column names against the real production schema before writing SQL;
  this has caused silent breakage twice already.
- Tests: `cd frontend && npm test` (vitest). Keep them passing — the deploy pipeline gates on it.
