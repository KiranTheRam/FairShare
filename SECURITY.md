# Security

## Current security status

FairShare is currently an interactive product prototype. The bundled Household data is illustrative and client-side actions do not write financial records to a production backend. **Do not use this release to store real household financial data or expose private account information.**

Before production financial use, the application still needs:

- Server-side account authentication with secure, rotating sessions.
- Household-scoped authorization on every read and write.
- A separately authorized administrator role that cannot participate in ledgers.
- CSRF protection for all state-changing requests.
- Server-side input validation, rate limiting, login throttling, and audit logging.
- A durable database implementation with encrypted backups and tested restore procedures.
- Push-subscription storage and authenticated notification delivery.
- Dependency scanning and a documented security-update process.

## Hardening included in this repository

- The container runs as an unprivileged user with dropped Linux capabilities, a read-only filesystem, and `no-new-privileges` in Compose.
- The service binds to loopback by default so a TLS reverse proxy is required for public access.
- CSP, clickjacking, MIME-sniffing, referrer, permissions, cross-origin, and HSTS headers are applied at the app/worker boundary.
- Dynamic HTML is marked private and non-cacheable in the Cloudflare worker.
- The service exposes a minimal health endpoint and disables framework identification headers.
- Docker builds use a pinned Node base image and produce provenance/SBOM metadata in CI.
- Secrets are not committed; local environment files are ignored.

## Public deployment baseline

Place FairShare behind a maintained HTTPS reverse proxy such as Caddy, Traefik, or nginx. Keep port `3000` bound to `127.0.0.1`, terminate TLS at the proxy, enable automated certificate renewal, and add an identity-aware access proxy until application-owned authentication is implemented. Never expose the container port directly to the internet.

Run dependency and image scanning regularly:

```bash
npm audit --omit=dev
docker scout cves kirantheram/fairshare:latest
```

## Reporting a vulnerability

Please report suspected vulnerabilities privately through GitHub's Security tab instead of opening a public issue. Include reproduction steps, affected routes, and the impact you observed.
