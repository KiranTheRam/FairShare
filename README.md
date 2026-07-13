# FairShare

FairShare is a self-hosted, mobile-first Progressive Web App for shared household expenses. It records who paid a vendor, how the cost is allocated, and repayments between members, then calculates clear person-to-person balances without erasing the underlying audit trail.

## Screenshots

### Household overview — default dark theme

![FairShare dark Household dashboard](screenshots/dashboard-dark.png)

### User settings and theme selection

![FairShare user settings with dark mode selected](screenshots/user-settings-dark-mode.png)

### Mobile PWA

<img src="screenshots/mobile-dashboard-dark.png" alt="FairShare mobile dashboard" width="390">

## What is included

- Email/password accounts using Argon2id password hashing.
- Server-side, revocable sessions in `HttpOnly`, `Secure`, `SameSite=Lax` cookies.
- One-time first-administrator bootstrap and a separate administrator console.
- Strict Household-scoped authorization on every financial read and write.
- Multiple Households and administrator-managed membership.
- Bills with vendor contributions, equal/percentage/fixed allocations, revisions, and change history.
- Server-calculated obligations and partial or complete repayments.
- Recurring bill templates with an idempotent hourly scheduler.
- In-app notifications and optional standards-based Web Push.
- Neutral Dark by default, plus account-persisted Forest Green and Light themes in user settings.
- Installable PWA behavior and a responsive desktop/mobile interface.
- PostgreSQL migrations, audit logs, login throttling, CSRF protection, and validated API inputs.
- Hardened, non-root container and a complete PostgreSQL Docker Compose stack.

## Deploy with Docker Compose

Requirements: Docker Engine and the Compose plugin.

```bash
git clone https://github.com/KiranTheRam/FairShare.git
cd FairShare
cp .env.example .env
```

Generate independent secrets rather than using the example values:

```bash
openssl rand -base64 36  # POSTGRES_PASSWORD
openssl rand -base64 36  # FAIRSHARE_SETUP_TOKEN
openssl rand -base64 36  # CRON_SECRET
```

Edit `.env` and set:

- `APP_ORIGIN` to the exact public HTTPS origin, such as `https://fairshare.example.com` (no trailing slash).
- `POSTGRES_PASSWORD`, `FAIRSHARE_SETUP_TOKEN`, and `CRON_SECRET` to different random values.
- Optional VAPID values if Web Push is required. Generate them with `npx web-push generate-vapid-keys`.

Start the stack:

```bash
docker compose pull
docker compose up -d
docker compose ps
```

The application binds to `127.0.0.1:3000`; PostgreSQL is not published to the host. Put your HTTPS reverse proxy in front of port 3000 and preserve the `Host`, `X-Forwarded-Proto`, and client IP headers.

On the first visit, FairShare displays the secure setup screen. Enter the configured `FAIRSHARE_SETUP_TOKEN`, administrator email, and a strong password. The bootstrap endpoint permanently disables itself as soon as the first account exists.

Database migrations run automatically before the Next.js server accepts traffic. The scheduler service calls the protected recurring-bill endpoint hourly.

### Updating

Back up PostgreSQL first, then pull and restart:

```bash
docker compose exec -T postgres pg_dump -U fairshare -d fairshare -Fc > fairshare-$(date +%F).dump
docker compose pull
docker compose up -d
```

Restore into an empty database with `pg_restore`. Test the restore procedure before depending on the data.

### Reverse proxy example

FairShare does not manage DNS, TLS, or your reverse proxy. A minimal Caddy site is:

```caddyfile
fairshare.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
}
```

TLS is mandatory in production because the session cookie is secure by default. For local non-TLS development only, set `COOKIE_SECURE=false` and use an `http://localhost` `APP_ORIGIN`; never deploy that setting publicly.

## Docker image

Every push to `main` builds multi-architecture images for `linux/amd64` and `linux/arm64` and publishes:

```text
kirantheram/fairshare:latest
kirantheram/fairshare:sha-<commit>
```

The workflow also publishes provenance and an SBOM. Pin a `sha-...` tag for controlled production releases.

## Local development

Run PostgreSQL (the Compose database service is convenient), then:

```bash
npm ci
export DATABASE_URL=postgresql://fairshare:password@127.0.0.1:5432/fairshare
export APP_ORIGIN=http://localhost:3000
export COOKIE_SECURE=false
export FAIRSHARE_SETUP_TOKEN=replace-with-at-least-16-characters
export CRON_SECRET=replace-with-a-long-random-value
npm run db:migrate
npm run dev
```

Quality checks:

```bash
npm run lint
npm test
npm audit --omit=dev
docker compose config --quiet
docker build -t fairshare:local .
```

## Data model

FairShare does not store a single mutable balance. It preserves the records that explain it:

```text
Bill
 ├─ external contributions (who paid the vendor)
 ├─ allocations (who is responsible)
 ├─ revisioned obligations (who owes whom)
 ├─ repayments
 └─ bill-change history

Household pair balance = active obligations - recorded repayments
```

Administrator accounts cannot be Household members or financial participants. Members only receive data for Households explicitly assigned to them.

## Security

The application includes authentication and authorization, but secure operation still depends on your deployment: HTTPS, protected secrets, timely image updates, database backups, and monitoring are required. See [SECURITY.md](SECURITY.md) for the implemented controls, known operational responsibilities, and vulnerability reporting process.

## License

See [LICENSE](LICENSE).
