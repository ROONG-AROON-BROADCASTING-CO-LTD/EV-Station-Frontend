# Local repository split — 13 October 2026

Original: D:/code/EV-Station (preserved, still production)
Frontend: D:/code/EV-Station-Frontend
Backend: D:/code/EV-Station-Backend

These are separate Git roots with independent main branches. Historical commits were extracted with git subtree split, then current tracked/untracked application source and public assets were overlaid. Dependencies, generated output, runtime files and secrets were excluded from Git. Root data documentation and import utilities are maintained in backend; frontend owns browser tests and the HTTP integration guide.

Local ignored runtime configuration was separated: browser configuration only in frontend; server configuration in backend. No remotes, GitHub repository creation or push was performed. Keep the monorepo as rollback until deployment and automation are deliberately migrated. Existing Windows startup scripts continue to use the monorepo.

For eventual deployment, build both repositories first. Backend compose retains project ev-station and its named volumes. Replace the old web container deliberately only after the frontend image and upstream have been verified. Do not run compose down --volumes or remove orphan services; those operations could remove production data or the current web service. Confirm the Cloudflare tunnel still points to port 8081 after any switchover.

The split itself does not synchronize later edits. Make future frontend changes in its repository and backend changes in its repository. GitHub remotes can be added later when authorized.

## Verified split snapshot

- Independent frontend frozen-lockfile install, TypeScript/Vite build and 24 unit tests passed.
- Independent backend go test ./... and go vet ./... passed in the Go build container.
- Docker images built using only their respective repository contexts; both Compose configurations validated.
- Isolated backend/PostGIS/Redis/migrations/MailHog stack reached healthy state. Backend health returned 200.
- Frontend nginx container served HTTP 200 and forwarded a protected API request to the isolated backend, which correctly returned 401 without credentials. No full browser E2E suite was run for this split.
- File inventory: 127 frontend and 155 backend application files carried over; no missing application files. Server-secret scan of the Git index passed; .env is ignored.
- Production containers and their volumes were not replaced. Test containers and isolated test data were removed after verification.
