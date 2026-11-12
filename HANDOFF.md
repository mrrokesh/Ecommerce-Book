# Salem Book House — technical handoff

Read @HANDOFF.md, then run `git status --short` and `git diff` before editing. Preserve working code and the current UI. Confirm your understanding of the state, then execute Step 5. Refresh this file before handing off or approaching the session limit.

Updated 2026-11-13 (India). Workspace: `D:\Website\Book E-Commerce`. Baseline `8400019` (`main` and local `origin/main` matched before this pass). Current changes are local. Stay in this folder.

## 1. Current objective

Continue the defensive security review and responsive QA of the redesigned storefront and admin portal. Preserve recent verification, checkout, abuse guard, campaign, and order alert features.

## 2. Completed work

- `backend/src/app.js` now uses the exact `CLIENT_URL` allowlist for browser writes and credentialed CORS. Proxy host headers no longer expand browser trust. `README.md` documents the configuration.
- `backend/test/integration.test.js` adds a configured/foreign browser origin regression and disables Rokesh Notify for the fixture. `backend/scripts/preview-qa.js` disables the same provider, lists local QA origins, and starts a fresh PostgreSQL fixture on a free loopback port.
- `frontend/src/admin/AdminLayout.tsx` and `admin-v2.css` give the mobile drawer keyboard focus, Escape handling, and a dynamic viewport height. The header search can shrink without pushing actions offscreen at 320 and 390 px.
- Verified this pass: frontend production build (including TypeScript), changed backend file syntax, and `git diff --check`. The preceding handoff recorded 34 backend tests passing before these changes.

## 3. Architecture and constraints

- React 19, Vite, TypeScript frontend. Express 5 and PostgreSQL backend. Frontend calls relative `/api`; Vite proxies locally and Vercel rewrites to Render in production. Keep CSP consistent across Express and Vercel when changing browser integrations.
- Add idempotent migrations in `backend/src/db/init.js` or `db/operationsMigration.js`. Prices and payment state are server controlled. Keep existing phone uniqueness, email verification, and per-product COD rules intact.
- Keep this workspace local. Use disposable test data. Disable real provider credentials and workers for QA. Never print or commit credentials. Commit/push only when asked. If committing, use the existing owner attribution without extra trailers.
- Cloudflare skill is checked out under `.security-audit/skill/`. Current reconnaissance notes belong in `.security-audit/run-1/`. Previous audit coverage and 34 passing tests are reported by the prior handoff, not independently rerun here.

## 4. Known issues / blockers

- Full Cloudflare audit is incomplete. The required offline sandbox with confined writes and resource caps was unavailable, the validator CLI rejected Windows file protection, and three reconnaissance agents hit a usage limit. No runtime-confirmed security findings from this pass. The origin regression remains to be executed in a suitable fixture.
- In the local Chromium preview, the dashboard, orders, new-product route, shop, product detail, populated cart, checkout, and home showed no document-width overflow at 320, 390, 768, 1024, and 1440 px. Checkout, dashboard, and orders also fit 667×375. At 320 px the drawer took focus and Escape restored it to the toggle. Real devices, other browser engines, and populated admin order tables remain unverified. Vite warned about a 533 kB entry chunk.
- Before release, verify that every active storefront origin is in `CLIENT_URL`. Google is documented as configured but real end-to-end sign-in is still pending. Facebook awaits owner-side Meta Business verification.

## 5. Immediate next step

Run `backend/test/integration.test.js` in a qualifying offline sandbox. Start with the browser-origin and CSV pricing cases, then validate the guest link and staff reset lifecycle with dummy accounts. Review `backend/src/routes/shipping.js` webhook handler against each configured carrier's expected event format before release. Use the separate browser QA fixture to check Safari and Android if available. The owner asked to leave social sign-in alone.

## Follow-up changes

- The staff guide is now a searchable webpage under Settings → Help & guide (`/admin/help`). The public Help Centre and static policies live in `frontend/src/pages/StoreHelp.tsx`. Removed the CMS editor, its permission, and the CMS API routes. Existing CMS database records are retained.

- Added `ADMIN_GUIDE.md` with staff workflows, permission explanations, and prioritized gaps. The README links to it.
- Hardened guest link expiry and revalidation, staff password reset revocation, carrier and AWB matching, and guest cart ownership. Older guest links need to be requested again. CSV and bulk pricing now keep the displayed discount synchronized. The new integration assertions still need execution in the audit sandbox.
- The admin sign-in and populated Orders table passed Chromium checks at 320, 390, 667, 768, 1024 and 1440 px. Fixed clipping of the table's Manage action at 1024 px and opened sample order details after rebuilding. Physical devices and other browser engines remain unverified.
- The populated QA preview checks its PostgreSQL host, port, and database before schema or sample-data writes. Use `QA_PREVIEW_PORT` to avoid an existing preview listener.
