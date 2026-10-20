# LinkPulse feature map

This package runs locally without Docker. Use MongoDB Atlas plus `USE_REDIS=false` for development; the worker reads the durable MongoDB outbox directly. Production deployment uses the provided Render Blueprint, Atlas and Render Key Value.

## Included platform capabilities

- Authentication: registration, login, bcrypt passwords, JWT authentication, role checks, resource ownership, account disablement and administrator bootstrap.
- Link lifecycle: generated/custom aliases, URL policy validation, passwords, expiry, click limits, device destinations, campaigns, multiple tags, folders, search, enable/disable and archive.
- Public redirect engine: password challenge, expiry/status/limit/blocklist checks, device selection, atomic redirect reservation and HTTP 302 response.
- IntentLock: destination versions, pending cross-domain proposals, allowed domains, administrator approval/rejection and stale-proposal protection.
- Analytics: persisted click events, unique-visitor estimates, qualification classes, daily activity, top links, campaign reporting, device/browser/referrer facets and QR attribution.
- Organization: campaign and tag creation, edit/archive support, color tags, duplicate tag protection and tag detachment on deletion.
- QR and CSV: persistent QR identifiers/PNG downloads; CSV validation, per-row processing, duplicate detection and audit records.
- Governance: activity logs, user administration, role changes, user disablement, platform link takedowns, domain blocklist and destination-change review.

## Current product boundaries

The following require a future dedicated design and are intentionally not represented as completed: shared/nested folders, multi-member workspaces, link-in-bio pages, country enrichment through a geolocation vendor, and a one-click destination rollback UI. The project retains destination versions, so a rollback can be implemented safely as a reviewed destination update.

## Public links

Set `PUBLIC_BASE_URL` on the API and `VITE_PUBLIC_BASE_URL` on the frontend to the same deployed redirect URL. That can be the Render API URL or a custom domain such as `https://go.example.com`. New copied links and QR codes then use the public address instead of localhost.
