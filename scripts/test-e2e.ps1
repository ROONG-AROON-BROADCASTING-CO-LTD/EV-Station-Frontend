param([string]$BackendPath = (Join-Path $PSScriptRoot '..\..\EV-Station-Backend'))
$ErrorActionPreference = 'Stop'
$BackendPath = (Resolve-Path -LiteralPath $BackendPath).Path
$compose = Join-Path $BackendPath 'docker-compose.e2e.yml'
if (!(Test-Path -LiteralPath $compose)) { throw 'Backend E2E compose file not found.' }
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  docker compose -p rbc-ev-station-split-e2e -f $compose up --build --wait
  if ($LASTEXITCODE -ne 0) { throw 'Isolated Docker services failed to start.' }
  docker compose -p rbc-ev-station-split-e2e -f $compose exec -T db-e2e psql -U rbc_e2e -d rbc_ev_station_e2e -c "INSERT INTO users (email, password_hash, display_name, role, is_active) VALUES ('owner@e2e.local', crypt('E2e-password-123!', gen_salt('bf')), 'E2E Owner', 'super_admin', TRUE) ON CONFLICT (email) DO NOTHING;"
  if ($LASTEXITCODE -ne 0) { throw 'Isolated test account could not be created.' }
  pnpm test:e2e
  if ($LASTEXITCODE -ne 0) { throw 'Playwright end-to-end tests failed.' }
} finally {
  docker compose -p rbc-ev-station-split-e2e -f $compose down --volumes --remove-orphans
  Pop-Location
}
