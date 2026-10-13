# RBC EV Station — Frontend

Independent React / TypeScript / Vite repository. Backend is accessed through HTTP at /api/v1; no backend checkout is needed to install, build or run frontend unit tests.

## Development

Requires Node 22+ and pnpm 10.15.0.

```powershell
pnpm install --frozen-lockfile
# .env is already configured locally. New checkouts: copy .env.example to .env.
pnpm dev
pnpm build
pnpm test
```

VITE_API_BASE_URL defaults locally to http://localhost:8080/api/v1. A backend must be running for API features. Values prefixed VITE_ are public browser configuration; never put server API keys or JWT/SMTP secrets here.

## Docker

```powershell
docker compose build
docker compose up -d
```

Web listens on WEB_PORT (default 8081). nginx forwards /api to API_UPSTREAM (default http://host.docker.internal:8080). For a remote backend, configure a trusted reachable URL. The browser continues using same-origin /api/v1. The backend does not need to share this repository or Docker project.

The original monorepo still runs production and already occupies port 8081. Use WEB_PORT=18081 for a separate local preview; do not start a second web service on the same port. No production switchover has been performed by this split.

## Integration tests

```powershell
pnpm test:e2e:stack
# Or: powershell -File scripts/test-e2e.ps1 -BackendPath D:\path\to\backend
```

The helper uses the backend's isolated E2E compose stack and cleans up only that test project. Frontend unit tests and builds are independent of backend source.

## Git migration

main preserves the original apps/web commit history. Latest local changes and new assets are included in the split snapshot. GitHub origin is the private repository https://github.com/ROONG-AROON-BROADCASTING-CO-LTD/EV-Station-Frontend. See MIGRATION.md.
