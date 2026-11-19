# Salem Book House — technical handoff

Read @HANDOFF.md, then run `git status --short` and `git diff` before editing. Preserve working code and the current UI. Confirm your understanding of the state, then execute Step 5. Refresh this file before handing off or approaching the session limit.

Updated 2026-11-19 (India). Workspace: `D:\Website\Book E-Commerce`. Site-errors dashboard (`/admin/errors`) and README/env docs are in this deploy pass. Stay in this folder.

**Warning (learned the hard way):** `backend/.env` has `DATABASE_URL` pointing at the LIVE Postgres. Starting the API locally with `npm start` connects to production and runs migrations and writes there. For any local run or browser QA, start the API with an empty `DATABASE_URL` (embedded Postgres) and `ROKESH_NOTIFY_API_KEY=""`, and set `CLIENT_URL` to include the dev server origin (the origin guard is an exact allowlist). The integration tests use their own throwaway database and are safe.

**Deploy pass (2026-11-19):** everything below and the other session's admin work was tested (37 backend tests, type check, build, browser audit at 5 widths on a throwaway database) and committed and pushed together. QA recipe: `cd backend && QA_PREVIEW_PORT=5100 node scripts/preview-qa.js`, then seed through the API, log in at `http://127.0.0.1:5100/admin/login` (`qa@example.invalid` / `LocalPreview123!`). Extra fixes in this pass: list pages search/Sent pill/local-day reports, marketing editor alignment, modal asterisks, gallery duplicate label, mobile product list, FormGuard no longer guesses rules for textareas (a complaint reply was flagged as an invalid email).

**Latest pass (2026-11-19, on top of the tree above):**

- **Admin validation never moves the layout.** Last block of `frontend/src/admin/admin-v2.css`: every `label:has(> input|select|textarea)` inside `.erp-shell` reserves one line under its control and the `.fg-error` message sits absolutely in it; `.form-row` is top-aligned. Measured in a browser on a throwaway fixture (`npm run preview:qa` from `backend`, `http://127.0.0.1:5100`, login `qa@example.invalid` / `LocalPreview123!`): 0 px shift on every admin form (products, categories, inventory, marketing, campaigns, payments, settings, staff, import). Overflow audit across 24 admin routes at 1024 and 390 px found only tables that scroll inside their own container.
- **Cover refresh** (`AdminProducts.tsx`): 10 minute wait; a browser timeout now shows "still running on the server" instead of a red error.
- **Complaint privacy fix** (`backend/src/routes/complaints.js`, `notify/complaintMail.js`, `ComplaintTrackPage.tsx`): ticket number plus email no longer opens a ticket. Signed-in customers' tickets open only for that account; guest tickets need a random expiring token emailed to the ticket address (`complaint_access_tokens`, hashed; 7 days in confirmation and reply emails, 24 h when requested via `POST /api/complaints/access-link`, which always answers the same). Token is sent in POST bodies and stripped from the address bar. Test updated; 37/37 pass.
- Not done: no commit or push yet for this pass; the other session's uncommitted admin work in the same files was not reviewed line by line by this pass (build, type check and the browser audit pass).

## 1. Current objective

Finish and ship the uncommitted admin UX / staff-access pass, then resume defensive security review and responsive QA. Preserve invite flow, Rokesh-style portal chrome, product gallery/provenance, and verification/checkout/campaign features already on `main`.

## 2. Completed work (on `main`)

- Admin Users invite flow + set-password emails; Rokesh-style chrome without a Settings dual-pane (`6fdabb4`).
- Products: four types (Book, Stationery, Toy, Gift card) with labels; one Add button; ERP sync only when configured (`f312514`).
- Admin layout overflow at 100% browser zoom (`668adc7`).
- Earlier: cascading Category → Subcategory on product form, gallery, provenance, customer detail, banners, complaints, security allowlist (see older commits / README).

## 3. Uncommitted work (this tree — not pushed)

**Backend**

- `PATCH /admin/staff/:id/status` with `{ status: 'active' | 'suspended' }`. Suspend bumps `token_version` (ends sessions). Blocks suspending yourself or the last admin. Reset-link refused while suspended.
- Login and `requireBackOffice` reject `staff_status === 'suspended'` (and invited still blocked until set-password).
- `publicStaff` exposes `invited` | `active` | `suspended`.
- Subscribers list includes opted-out customer accounts (`marketing_opt_in = false` but had `marketing_consent_at`) and inactive `marketing_subscribers`, ordered active first.
- **Site errors:** `site_errors` table + `errors/tracker.js` (fingerprint dedupe, email via `ERROR_ALERT_EMAILS`). Public `POST /api/errors/report` (rate-limited); admin `GET /api/errors`, `/counts`, `PATCH /:id`. Express 500s also recorded in `app.js`.

**Frontend**

- **Site errors dashboard** at `/admin/errors` (Settings → Site errors); open-count nav badge; client `reportError` + ErrorBoundary + axios 5xx reporter.
- **Users:** Suspend / Restore actions; status pills Invited / Active / Suspended.
- **Subscribers:** filters All / Subscribed / Unsubscribed; Unsubscribe keeps the row; export includes status.
- **Shipping partners:** Configure opens a centred modal (`a-modal`) instead of a panel below the fold.
- **Orders:** detail card max-width centred; packing slip / label / refunds / Create shipment in one `erp-detail-actions` row.
- **Categories:** compact `cat-editor` grid (reserved space under fields so validation does not skew the row); denser `cat-table` with Edit / Hide / Delete as text links.
- **Inventory:** Adjust stock + Load stock history on one `inv-adjust` row with the fields.
- **Campaigns / Payments / Reports / Store settings:** form layout CSS (`campaign-form`, `ops-form`, title-case KPIs, ISO day formatting in ops tables).
- **Product form:** `form-row` / `form-row-3` with full-width inputs; password-manager ignore attrs on the form.
- CSS: `admin.css` + `admin-v2.css` — `.form-row`, table action nowrap, ops-table compact rows, cat/inv/campaign helpers.
- **README.md** updated for the above.

## 4. Architecture and constraints

- React 19, Vite, TypeScript frontend. Express 5 and PostgreSQL backend. Frontend calls relative `/api`; Vite proxies locally and Vercel rewrites to Render in production.
- Staff statuses live in `users.staff_status` (`invited` | `active` | `suspended`). Schema comes from `db:init` / migrations already on deploy.
- Prices and payment state are server controlled. Keep phone uniqueness, email verification, and per-product COD rules intact.
- Keep this workspace local. Use disposable test data. Disable real provider credentials for QA. Never print or commit credentials. Commit/push only when asked.

## 5. Known issues / blockers

- `ERROR_ALERT_EMAILS` is set in `render.yaml` for the live Render service; confirm Blueprint sync applied it after deploy.
- Categories / wide admin tables: owner reported sparse columns and “not straight” forms at 100% zoom; latest CSS targets that — re-verify in Chromium after a hard refresh.
- Browser password-manager overlays can still paint numbered chips over the product gallery drop zone; form has `data-lpignore` / `data-1p-ignore` but extensions may ignore them.
- Full Cloudflare / security-audit pass remains incomplete from earlier handoffs. Integration suite was last reported ~37/37 on throwaway DB; not re-run in this session.
- Google social sign-in still needs a real end-to-end check; Facebook awaits Meta Business verification. Owner asked to leave social alone unless requested.

## 6. Immediate next step

1. Browser-check locally (empty `DATABASE_URL`): Categories add row + table, Inventory adjust row, Users Suspend/Restore, Subscribers Unsubscribed filter, Shipping Configure modal, Orders detail actions, product form at 100% zoom.
2. When the owner asks: commit the uncommitted set (do not include `.env`), push `main`, confirm Vercel + Render deploy.
3. Then resume: guest-link / staff-reset lifecycle tests in `sbh-local-backend-test:24` (see `.security-audit/docker-test-fixture/`), and carrier webhook format review in `backend/src/routes/shipping.js`.

## Follow-up notes

- Staff guide: Settings → Help & guide (`/admin/help`). Product backlog/gaps: `ADMIN_GUIDE.md`.
- Client-facing runbook: `CLIENT_HANDOFF.md` (keys, smoke test). Update it if Suspend or Subscribers filters need client-facing wording after deploy.
