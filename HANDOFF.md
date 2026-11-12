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

Open `backend/src/routes/operations.js` and review the `router.post('/products/import', ...)` handler first. Compare its field and stock validation with single-product writes in `backend/src/routes/admin.js`. Fix any confirmed mismatch at the write boundary and add a focused regression if needed. Then run the origin regression in the required sandbox. For additional responsive coverage, use `npm run preview:qa` from `backend` after building `frontend` and check populated admin tables and the admin sign-in page, including Safari and Android if available.
