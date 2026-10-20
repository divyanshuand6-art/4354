# LinkPulse MVP

A MERN-based URL shortener and link lifecycle platform. This is the first implementation increment; not every planned feature is complete.

## Deployment target

- **Frontend:** Render Static Site (React + Vite)
- **API + redirect engine:** Render Web Service (Node.js + Express)
- **Click processing:** Render Background Worker
- **Queue:** Render Key Value (Redis-compatible; new instances use Valkey)
- **Database:** MongoDB Atlas online — MongoDB is not hosted in Docker or on Render

A `render.yaml` Blueprint is included to define the Render services. The Atlas cluster must be created separately because it is an external managed database.

## Implemented in this increment

- Registration, login, JWT authentication, and backend role checks (`user` / `admin`). Public registration always creates a regular user.
- Link create/list/detail/update/archive APIs with generated or custom aliases, ownership checks, expiry, click caps, password hashes, campaigns/tags, device destinations, and basic URL/domain safety validation.
- IntentLock starter: approved destination versions; a cross-domain change from a regular user is held pending; admin review approves/rejects it. The redirect engine only uses the currently approved destination stored on the link.
- Public redirects at `/r/:code`, password form/unlock, status/expiry/click-cap checks, current blocklist check, and device-target selection.
- Click counter + click event + outbox record committed in one MongoDB transaction before an HTTP 302 response.
- Redis Streams dispatcher/worker, idempotent event classification, basic rule-based bot filtering, and retry by reclaiming pending Redis messages.
- Durable outbox recovery: unprocessed events that were published to Redis but remain unprocessed are re-published after a delay. Duplicate delivery is expected and handled idempotently. This is important when using an ephemeral queue plan.
- Campaigns, tags, QR-code generation/download, CSV bulk import with per-row errors, link/campaign analytics, activity history, admin blocklist, link disable, user list/disable/role change, and pending-version review.
- React dashboard connected to real API responses: overview, link management, campaigns, tags, QR codes, bulk import, activity, and admin controls.

## Not complete yet / known MVP limits

- Link-in-bio pages are not implemented in this increment.
- Folder organization is a text label on a link, not yet a dedicated shared Folder collection.
- Country-level enrichment is not implemented; country remains empty unless a geolocation provider is added.
- Bot detection is rule-based and heuristic. It cannot prove a click was human; unknown and suspected traffic should remain visible.
- Unique visitors are estimates based on a first-party visitor cookie. They are not verified identities.
- JWT is stored in browser localStorage in this MVP frontend. For production, prefer secure HttpOnly cookies or another reviewed session approach, add CSRF protection where applicable, and apply a security review.
- Audit logging is best-effort in this increment; production governance should make critical audit writes durable and observable.
- Render's free Key Value service has no disk persistence. The MongoDB outbox remains the source of truth and the worker re-publishes stale unprocessed events, but use a persistent Key Value plan for stronger queue durability at higher traffic.

## Deploy online with MongoDB Atlas + Render

### A. Create MongoDB Atlas

1. Create an Atlas project and a cluster. Choose a region close to your Render region; this setup uses Singapore as the default Render region.
2. Create a **database user** for LinkPulse. Use a strong, unique password; this is separate from LinkPulse website user accounts.
3. In Atlas **Network Access**, allow the outbound IP ranges shown in Render for both `linkpulse-api` and `linkpulse-worker`. Keep the list as restricted as practical. Do not leave `0.0.0.0/0` enabled for production.
4. In Atlas, choose **Connect → Drivers → Node.js** and copy the connection string. It should resemble:

   ```text
   mongodb+srv://<db_user>:<url_encoded_password>@<cluster-host>/linkpulse?retryWrites=true&w=majority
   ```

   Replace all placeholders. URL-encode special characters in the database password. Do not commit the real connection string.

### B. Deploy the Render Blueprint

1. Push the **contents** of this `LinkPulse_MVP` folder to a GitHub repository (so `render.yaml` is in the repository root).
2. In Render, choose **New → Blueprint**, connect the repository, and apply `render.yaml`.
3. When prompted, provide `MONGODB_URI` using the Atlas application connection string.
4. The Blueprint defines the API web service, frontend static site, background worker and a Redis-compatible Render Key Value queue. The API/worker use Atlas; no MongoDB container is deployed.
5. Ensure the API and worker run in the same Render region as the Key Value service. The provided Blueprint sets Singapore.
6. Wait for all services to deploy. Render service URLs are connected through `RENDER_EXTERNAL_URL` references in the Blueprint, so the frontend API base URL, backend CORS origin and short-link base URL stay aligned with the service URLs.

### Public redirect domain

The deployed API URL is already public, so redirects are immediately shareable as `https://<your-api>.onrender.com/r/<code>`. For a branded public short-link domain, add a custom domain such as `go.yourdomain.com` to the **API** service in Render, point the required DNS record at Render, then set both `PUBLIC_BASE_URL` on the API service and `VITE_PUBLIC_BASE_URL` on the frontend service to `https://go.yourdomain.com`. Redeploy both services after changing these values. The dashboard copy button and generated QR codes will then use that public domain.

Official setup references:
- Render + MongoDB Atlas: https://render.com/docs/connect-to-mongodb-atlas
- Render Blueprints: https://render.com/docs/blueprint-spec
- Render Key Value: https://render.com/docs/key-value

### C. Bootstrap the first administrator

The public registration endpoint intentionally cannot create an administrator. After Atlas is configured to allow your development machine's IP, create a local `backend/.env` with the Atlas `MONGODB_URI` plus:

```env
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_ADMIN_PASSWORD=a-long-unique-password-at-least-12-chars
BOOTSTRAP_ADMIN_NAME=LinkPulse Admin
```

Then run from the `backend` directory:

```bash
npm install
npm run seed:admin
```

Unset/remove the bootstrap password immediately afterward. Use the seeded account to sign in to the deployed site. Change the example email/password to credentials you control.

### D. Verify the deployment

1. Open `https://<your-linkpulse-api>.onrender.com/health`. It should return JSON with `"status":"ok"`.
2. Open the frontend's Render URL and register a regular user.
3. Create a link, open its `/r/<code>` URL, and confirm `clickCount` and the click event update.
4. Wait for worker classification, then refresh analytics. Reports should use persisted events, not hardcoded sample metrics.
5. Test expired, disabled, password-protected, over-limit, and bot-signature requests.
6. Check API and worker logs in Render if Atlas connection, Redis connection, or worker processing fails.

## Local development without Docker

MongoDB uses the same online Atlas cluster during local development. Add your current development IP to Atlas Network Access before connecting from your computer. Docker and a local Redis server are **not required**: the bundled worker can process the durable MongoDB outbox directly.

Copy `backend/.env.example` to `backend/.env`, then set:

```env
MONGODB_URI=mongodb+srv://<db_user>:<url_encoded_password>@<cluster-host>/linkpulse?retryWrites=true&w=majority
USE_REDIS=false
FRONTEND_ORIGIN=http://localhost:5173
PUBLIC_BASE_URL=http://localhost:4000
```

Use real Atlas credentials only in your local `.env` or Render environment variables, never in source control.

Install backend dependencies and run the API:

```bash
cd backend
npm install
npm run dev
```

In a second terminal, start the no-Docker local worker:

```bash
cd backend
npm run worker
```

In a third terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`; API health is at `http://localhost:4000/health`.

## Requirements

- Node.js 20+ (Render Blueprint requests Node 22)
- MongoDB Atlas cluster supporting multi-document transactions (Atlas replica-set-backed clusters support this workflow)
- No Docker or Redis installation is needed for local development. For production, Render Key Value/Valkey is used for the asynchronous queue.

## CSV format

Required: `originalUrl` (or `url`). Optional: `code` (or `alias`), `title`, `expiresAt` (ISO date), `clickLimit`.

```csv
originalUrl,code,title,expiresAt,clickLimit
https://example.com/sale,sale26,Sale landing page,,1000
```

Maximum 500 data rows and 1 MB per upload in this MVP.

## API overview

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET/POST /api/links`, `POST /api/links/validate`, `GET/PATCH/DELETE /api/links/:id`
- `GET/POST/PATCH /api/campaigns`, `GET/POST/DELETE /api/tags`
- `GET /api/analytics/overview`, `GET /api/analytics/campaigns`, `GET /api/analytics/links/:id`
- `POST /api/links/:id/qr`, `GET /api/links/:id/qr`, `GET /api/qr/:id/image`
- `POST /api/links/bulk-import`
- `GET /api/activity`
- Admin: `/api/admin/users`, `/api/admin/blocked-domains`, `/api/admin/link-versions`, `/api/admin/links/:id/disable`
- Public redirects: `GET /r/:code`, `POST /r/:code/unlock`

## Architecture note

MongoDB Atlas is the source of truth. A successful redirect transaction increments `links.clickCount` and inserts `clickEvents` and `outboxEvents` before returning HTTP 302. The background worker publishes pending outbox events to Redis Streams, classifies traffic and updates event classification. If Redis is unavailable or its ephemeral queue is restarted, the pending/stale MongoDB outbox remains recoverable and unprocessed published events are re-queued after the recovery delay.

## Reference-matched frontend and subscription integration

See [`BACKEND-FRONTEND-INTEGRATION.md`](./BACKEND-FRONTEND-INTEGRATION.md) for the API contracts, subscription limits, mock checkout behavior, and local setup for the updated frontend.
