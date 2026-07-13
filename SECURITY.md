# Security

## Security model

FairShare is designed for direct self-hosting behind an HTTPS reverse proxy. Authentication, authorization, ledger calculation, and validation are enforced by the server; the browser is never trusted to decide access or balances.

Implemented controls include:

- Argon2id password hashing with a 64 MiB memory cost and three iterations.
- Random 256-bit session tokens; only SHA-256 token digests are stored in PostgreSQL.
- `HttpOnly`, `Secure`, `SameSite=Lax`, host-only cookies with 30-day expiry.
- A random per-session CSRF token plus exact-origin validation on every mutation.
- Login throttling by normalized email and client IP.
- Zod validation, request size limits, integer-cent money values, and server-calculated obligations.
- Household membership checks on every Household read and write.
- A separate administrator role that cannot be assigned to a Household ledger.
- Optimistic bill revision checks to reject stale concurrent updates.
- Append-only bill change history and security/administration audit logs.
- Idempotency protection for recurring bill generation.
- Push subscriptions scoped to their authenticated owner.
- Private, non-cacheable API responses and no authenticated HTML in the service-worker cache.
- CSP, clickjacking, MIME-sniffing, referrer, permissions, COOP/CORP, and HSTS headers.
- Non-root container execution, read-only application filesystem, dropped Linux capabilities, `no-new-privileges`, loopback-only app binding, and an unpublished database port.
- Locked dependency graph, automated multi-architecture image builds, provenance, and SBOM output.

## Deployment responsibilities

Production safety still depends on the operator:

- Terminate TLS at a maintained reverse proxy and set `APP_ORIGIN` to the exact external HTTPS origin.
- Do not set `COOKIE_SECURE=false` in production.
- Do not publish container port 3000 or PostgreSQL directly to the internet.
- Generate unique high-entropy database, bootstrap, and scheduler secrets; keep `.env` readable only by the service operator.
- Remove or rotate the bootstrap token after the first administrator is created.
- Forward a trustworthy client IP header and strip untrusted incoming forwarding headers at the proxy.
- Pin release image tags, install security updates promptly, and monitor authentication/audit events.
- Back up PostgreSQL with encryption at rest and regularly test a full restore.
- Configure host-level firewalling, disk encryption, resource limits, log retention, and intrusion monitoring appropriate to the server.

FairShare stores financial coordination records, not bank credentials, and does not move money. Treat its database as sensitive personal information.

## Remaining considerations

The default Content Security Policy permits inline framework scripts/styles required by the current Next.js output. It still blocks third-party origins, framing, plugins, and unexpected network destinations. Operators with a stricter CSP requirement can add nonce-based rendering at their reverse proxy/application boundary after testing framework upgrades.

Account recovery is intentionally administrator-mediated for a self-hosted installation. An administrator can assign a new password; changing or disabling an account revokes its active sessions. There is no email-based reset flow unless the operator adds a trusted mail service.

## Verification

Before a release or upgrade, run:

```bash
npm ci
npm run lint
npm test
npm audit --omit=dev
docker build -t fairshare:local .
```

Scan the published image with your preferred scanner (for example Docker Scout, Trivy, or Grype), and test login, cross-Household isolation, CSRF rejection, backup, and restore in a non-production environment.

## Reporting a vulnerability

Report suspected vulnerabilities privately through the GitHub repository’s Security tab rather than a public issue. Include affected versions, reproduction steps, and impact. Do not include real household data or credentials.
