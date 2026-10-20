# Backend and new frontend integration

This project uses the new reference-matched LinkPulse frontend with the backend from `LinkPulse-complete-no-docker.zip`.

## API contracts connected

- Authentication: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`; session responses now include `plan`, `subscriptionStatus`, and `subscriptionExpiresAt`.
- Link management: `GET/POST /api/links`, `PATCH/DELETE /api/links/:id`, QR generation and redirect flow.
- Organization: `/api/campaigns`, `/api/tags`.
- Analytics: `/api/analytics/overview`, `/api/analytics/campaigns`, `/api/analytics/links/:id`.
- Activity and administration: `/api/activity` and the existing `/api/admin/*` routes.
- Billing: `GET /api/billing/usage`, `GET /api/billing/config`, `GET /api/billing/history`, `POST /api/billing/mock-checkout`.
- Bulk CSV import: `POST /api/links/bulk-import`.

## Subscription rules

- Free: 25 new links/month and 1,000 tracked clicks/month.
- Pro: ₹199/month in the demo flow; 500 new links/month and 25,000 tracked clicks/month.
- Growth: ₹599/month in the demo flow; 2,000 new links/month and unlimited tracked clicks.
- Mock checkout activates the selected plan for 30 days on the account authenticated by its bearer token. It always simulates success locally; it never accepts card/UPI details or charges real money.
- `MOCK_BILLING_ENABLED=true` is intended for local demo work only. It is disabled by default when `NODE_ENV=production` unless explicitly set to `true`; do not enable it in production.
- Click quotas limit analytics collection after the quota is reached, not the visitor's ability to reach an otherwise valid short-link destination.
- Existing redirects stay available after a plan expires, subject to normal link-level rules. Subscription plans gate supported backend features; features that are only described in marketing/pricing copy still need dedicated product implementations.

## Local setup

1. Keep your existing backend `.env` private. If needed, add `MOCK_BILLING_ENABLED=true` for local test-only checkout.
2. Backend: `cd backend && npm install && npm run dev`.
3. Frontend: in a second terminal, `cd frontend && npm install && npm run dev`.
4. `frontend/.env` should set `VITE_API_BASE_URL=http://localhost:4000`.
5. Start the click worker for analytics classification. For local use without Redis, keep `USE_REDIS=false` as in the backend example and run `cd backend && npm run worker` in a third terminal.
6. MongoDB transaction features require an Atlas replica-set connection or another MongoDB deployment configured for transactions.

The frontend package includes Recharts for the dashboard's charts. Run `npm install` (not `npm ci`) after the frontend dependency list changes so that the lockfile is refreshed.
