# Salem Book House

Online bookstore for Salem Book House, Salem, Tamil Nadu: **Vite + React + TypeScript** storefront, **Node.js + Express** API, **PostgreSQL**.

## Features

- Catalogue with nested categories (Books → Tamil, Fiction, …), multi-select category and language filters, search, author and publisher pages
- Cart (guest and signed-in), wishlist, saved addresses, coupons and gift cards, pincode delivery check
- Guest and signed-in checkout: Cash on Delivery, or UPI / cards / net banking through Razorpay. Any product can be marked "Cash on delivery available" off in the admin; such products show an "Online payment only" notice on the product page, and checkout then offers only the online methods (the server refuses COD for them too). A short success chime plays when an order is placed
- Sign in / sign up with email, Google or Facebook; email verification on sign-up, welcome, new sign-in and password-changed emails
- Customer complaints: a form at `/complaint` (signed in or as a guest) gives a ticket number, and `/complaint/track` shows the thread and takes follow-ups; staff answer and resolve them under **Sales → Complaints**
- Order tracking and GST invoice download for signed-in customers (own orders only), cancellations, item-level returns with refunds, and a secure emailed link for guest orders
- Reviews, store locator, exam-prep section and static storefront help and policy pages
- New-order alerts in the admin: a chime, a toast and a desktop notification when a customer places an order while the admin is open (checked every 15 seconds by a background worker, so it keeps working while the tab is behind other tabs or apps; the bell in the top bar mutes it and your choice is remembered; leave the admin tab open, and click the page once so the browser allows sound and notifications)
- Admin sign-in at `/admin/login` with a brand panel and centred form (collapses to a single card on phones)
- Admin panel at `/admin` with Rokesh-style chrome: dark sidebar of collapsible groups with live count badges (orders to action, open returns, pending refunds, low stock, open site errors) and a daily email usage meter, jump-to-page search, green confirmation toasts, a dashboard of pending actions, low stock and recent orders, and a layout that works at 100% browser zoom and on phones (separate sign-in, no storefront chrome): products (four types — Book, Stationery, Toy, Gift card — with multi-image gallery and provenance), categories, orders, customers (profile, orders and internal notes), reviews, coupons and banners (image upload), email outbox, **Users** (invite staff by email, suspend / restore), **Site errors** (live storefront and API failures with resolve / ignore), multi-carrier shipping (Shiprocket, Delhivery, Blue Dart, DTDC, Shadowfax — Configure opens a centred modal), Rokesh ERP product sync when configured
- Admin tables keep Edit / Hide / Delete (and similar actions) on one line; order detail cards are centred with packing slip, label, refunds and shipment actions in one row; inventory adjust and stock history sit on one form row with the fields; the Inventory list has its own search box that filters while typing, a "Low stock only" switch, and clicking a product row fills the Product ID for the stock adjustment; the Products list also searches while typing (short pause after the last keystroke, stale answers are dropped)
- Product provenance on every catalogue item: who added it (admin or staff), who last edited it, and for ERP rows a Rokesh source line with the API host and a masked key tip (never the secret); shown at the bottom of the product form; list pills show Admin / Staff / ERP at a glance
- Product images: drag-and-drop or URL gallery on add/edit (first image is the shop cover; extras show on the product page); admin product-list thumbs stay fixed-size so covers do not collapse
- Product categories on add/edit use cascading Category → Subcategory dropdowns (same idea as Rokesh ERP), with chips for multiple assignments; the Categories page uses a compact add row and a dense hierarchy table
- Customers under **Sales → Customers**: search, view profile, order history and staff-only internal notes
- Homepage banners under **Marketing**: title, link and image (URL or upload); empty banner images show a yellow fallback stack until a cover is set
- Back-office operations in the admin: inventory and stock history, CSV import and bulk edits, payments and refunds, returns, sales reports (readable day labels and title-case KPIs), gift cards, store settings and delivery coverage, audit history, and optional authenticator-app two-factor sign-in
- Branded HTML emails for every message (welcome with a real coupon, order receipt, shipping status tracker, returns, refunds, password reset, security alerts) and an admin **Promotional emails** section for seasonal sales (Diwali, Pongal, flash sales): templates, coupon attachment, preview, test send, send to opted-in customers, unsubscribe link and delivery stats, plus a **Subscribers** page (filter All / Subscribed / Unsubscribed, who agreed and when, add with consent confirmation, unsubscribe without deleting the row, export CSV); a campaign goes to everyone subscribed or only the people you tick
- All store email (orders, shipping, returns, refunds, account) is sent through Rokesh Notify from `noreply@salembookhouse.com`, with SMTP as a fallback and an admin outbox with automatic retries
- Live form validation on every form (names, email, Indian mobile numbers, pincodes, passwords, links, ISBNs) with matching server-side checks
- Responsive layout (phones from 320px up) with 44px header tap targets and finger-friendly footer links, checked with no sideways scrolling at 320, 360, 440, 768 and 1024px, toast feedback, in-page dialogs (no browser pop-ups), 404 and error screens

## Quick start

```bash
cd backend && npm install && cp .env.example .env && npm run dev
cd frontend && npm install && npm run dev
```

Store: http://localhost:5173 · API: http://localhost:5000

Leave `DATABASE_URL` empty in `backend/.env` to use the embedded local Postgres (seeded automatically on first run). Set it to use a hosted Postgres.

To run the storefront against an API on another port: `API_PROXY=http://localhost:5100 npm run dev` in `frontend`.

### Local admin account

In development the seed creates an admin user (`ADMIN_EMAIL`, default `admin@salembookhouse.com`). Set `ADMIN_PASSWORD` in `backend/.env` to choose its password; check `backend/src/db/extraSeed.js` for the development default. **Never use the development default in production.**

## Configuration

All settings live in `backend/.env` (see `backend/.env.example`, which lists every option). The important ones:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Session signing key. **Required in production**, 24+ characters |
| `ADMIN_PASSWORD` | Admin password. **Required in production** |
| `CLIENT_URL` | Allowed storefront origin(s), comma-separated |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Live online payments. Without them, the production build offers Cash on Delivery only |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | "Continue with Google". The button hides when unset |
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` | "Continue with Facebook". The button hides when unset |
| `OAUTH_REDIRECT_BASE` | Public site origin for social sign-in callbacks (e.g. `https://www.salembookhouse.com`); defaults to the first `CLIENT_URL` |
| `WELCOME_COUPON` / `MAIL_DAILY_CAP` | Coupon code shown in the welcome email (default `WELCOME10`) and the most emails sent in 24 hours (default 1500; Rokesh Notify Pro allows 2000) |
| `TRUST_PROXY_HOPS` | Proxy hops before the API (default 1; **4 on Vercel + Render**, measured on the live site: Vercel, Cloudflare and two Render hops sit in front of the API). Without the right value every visitor shares one rate-limit address. Sign in as admin, open `/api/security/network`: `ip` must equal your own public address, and the page tells you the number to use |
| `LOGIN_MAX_FAILS` / `SIGNUP_DAILY_CAP` / `COD_DAILY_CAP` | Limits that do not depend on the visitor's address, so they still hold if someone calls the Render URL directly and fakes `X-Forwarded-For`: failed sign-ins per account per 15 minutes before a lock (default 10; the right password is refused until it clears or the password is reset), new accounts per 24 hours (default 500), and cash-on-delivery orders per 24 hours (default 300; paid online orders are not capped) |
| `COMPLAINT_PER_EMAIL_DAILY` / `COMPLAINT_DAILY_CAP` | Complaints one email address may raise in 24 hours (default 5) and the site-wide daily limit (default 300). A connection is also limited to 6 an hour |
| *(account rules, no setting)* | One account per phone number: registering or saving a profile with a number another account already uses (compared on the last 10 digits, so `+91 98765-01234` equals `9876501234`) is refused with 409. Customers must verify their email before placing an order or paying (`403`, code `EMAIL_NOT_VERIFIED`); staff, guests and Google/Facebook sign-ins (already verified) are not affected. Existing accounts that share a phone are left alone. A valid 10-digit mobile number is mandatory at checkout: the form marks it required, and the server refuses a COD order, a saved address without a valid number, or an online-payment start (before any money is taken) with `400` |
| `ROKESH_NOTIFY_API_URL`, `ROKESH_NOTIFY_API_KEY` | Outgoing email through Rokesh Notify (preferred). Needs `salembookhouse.com` verified in Notify (SPF + DKIM DNS records). Mail is sent from `MAIL_FROM`, default `Salem Book House <noreply@salembookhouse.com>` |
| `SMTP_*` | Fallback email via SMTP, used only if Rokesh Notify is not set. With neither, mail stays in Admin → Email outbox (password-reset emails will not be delivered) |
| `ERROR_ALERT_EMAILS` | Comma-separated addresses emailed when a new or reopened site error is recorded (default unset = no alert mail). View and resolve in **Settings → Site errors** (`/admin/errors`) |
| `SHIPPING_WEBHOOK_SECRET` | Shared secret for carrier tracking webhooks |
| `ERP_API_URL` / `ERP_API_KEY` | Optional Rokesh / Muruga store sync (`mrerp_…` key as `X-Api-Key`). Sync stamps products as ERP with a masked key tip and the staff member who clicked **Sync from ERP** |
| `SHIPROCKET_EMAIL` / `SHIPROCKET_PASSWORD` / `SHIPROCKET_CHANNEL_ID` / `SHIPROCKET_PICKUP_*` | Optional Shiprocket (also configurable in **Admin → Shipping partners**) |

### Admin list pages and screens (QA pass)

Checked on a throwaway database with 16 products, 4 orders, coupons and complaints at 1366, 1280, 1024, 768 and 390 px: no page scrolls sideways; only wide tables (orders, categories, complaints, audit, email outbox on phones) scroll inside their own box. Fixes from that pass: the generic list pages (`AdminOperations.tsx`) show the search box only where the server filters by it (customers, inventory, gift cards, email outbox, returns), the toolbar is a form so Enter searches, the Email outbox shows a Sent / Not sent pill and hides the internal id, the Audit history hides actor id and empty details, timestamps in `_at` columns show date and time, and the Sales report range uses the browser's local day so today's orders are included. Banner and coupon editors align their labels and span the checkbox row, modal required-field asterisks stay on the label line, the product gallery no longer shows two "Primary" labels, and on phones the product list keeps name, sale price, stock and status. Free-text boxes (replies, notes, descriptions) never get a guessed format rule from words like "email" in their hint text (`FormGuard.tsx`).

### Admin form validation

Every labelled field in the admin portal reserves one line under its input for its validation message (`admin-v2.css`, last block), so typing, leaving a field or submitting an empty form never moves the layout, and fields in the same row stay level. Rows use top alignment. The product list's cover refresh waits up to 10 minutes and, if the browser gives up first, says the job is still running instead of showing an error.

## Customer complaints

Customers raise a complaint at `/complaint` (category, optional order number, subject, details; name and email come from the account when signed in). It returns a ticket such as `CMP-000123` and sends a confirmation email.

**Who can open a ticket.** The ticket number is sequential, so it never proves ownership. A signed-in customer's ticket opens only for that account (`/complaint/track` lists them). A guest's ticket opens only from a personal link emailed to the address on the ticket (`/complaint/track?n=TICKET&t=TOKEN`). The token is random, stored hashed in `complaint_access_tokens`, expires (7 days for links in confirmation and reply emails, 24 hours for a requested link) and is removed from the address bar when the page opens. A guest who lost the link enters the ticket and email at `/complaint/track`; the answer is always the same and a new link is mailed only if both match (`POST /api/complaints/access-link`). Tokens are sent in a POST body, never in an API URL. Replies and a follow-up on a resolved ticket (which reopens it) are posted from the opened ticket; closed tickets take no more replies.

Staff need the **Complaints** permission (`support`, grantable on a staff role; admins have it). **Sales → Complaints** lists tickets by status with a count badge in the sidebar, searchable by ticket, name, email, order or subject. Opening one shows the customer's details, the linked order, and the thread. Staff can reply to the customer (emailed), add an internal note (never shown to the customer), set priority, assign it to themselves, and mark it resolved, which needs a written resolution that is emailed. Staff actions are written to the audit history. Tables: `complaints`, `complaint_messages`, `complaint_access_tokens`. API: `/api/complaints` (customer) and `/api/complaints/admin` (staff).

## Admin portal and staff

Open **Settings → Help & guide** (`/admin/help`) for searchable staff documentation. See the [repository admin guide](ADMIN_GUIDE.md) for the feature backlog.

The admin portal lives at `/admin` with its own sign-in page (`/admin/login`). The storefront does not link to it, and the storefront `/login` is for customers only.

**Site errors** (`/admin/errors`, admin-only): browser crashes (`ErrorBoundary`, `window.onerror`, unhandled rejections), storefront API 5xx responses, and Express 500s are written to Postgres (`site_errors`), deduped by fingerprint (occurrence count + last seen), and optionally emailed to `ERROR_ALERT_EMAILS`. Open count shows as a Settings nav badge; open / resolve / ignore from the dashboard. Public `POST /api/errors/report` is rate-limited; list and status changes need an admin session.

Access is managed in **Settings → Users** (`/admin/staff`):

- **Admins** have full access, including user and role management.
- **Staff** get a **role**. A role is a name plus the **modules** (sections) it can open: Dashboard, Orders, Products, Categories, Customers, Reviews, Shipping partners, Banners & coupons, Email outbox, Complaints, and related edit/refund permissions. Staff only see those sections in the menu.
- A starter role, **Order manager** (Orders only), is created on first run. Edit it or create your own under **Roles & modules** on the Users page (for example "Catalogue editor" with Products and Categories).
- Changing a role's sections applies to everyone with that role on their next request. A role cannot be deleted while staff have it.
- **Invite user** (name, email, role) creates an **INVITED** account and emails a personal set-password link (`/admin/set-password?token=…`, valid 7 days). The link is also copied for chat. Until they set a password they cannot sign in. Status becomes **Active** after they finish the link; last sign-in is recorded on each admin/staff login.
- For invited users: **Copy invite link** / **New link** (re-emails). For active users: **Password reset link** (2-hour link, emailed), **Suspend** (blocks portal sign-in and ends open sessions; they stay on the Users list as Suspended), **Restore**, and **Edit** (role). **Remove** turns the account back into a normal customer (order history kept). You cannot suspend, change or remove your own access, or leave the store without an active admin.
- Suspended staff cannot sign in or call admin APIs until restored. Invited staff must accept the invite before signing in.
- Permissions are enforced by the API (`requireBackOffice` / `requirePermission` and the module map in `backend/src/routes/admin.js`), not just hidden in the menu.
- The Orders section includes setting an order to cancelled or refunded, which issues the Razorpay refund.
- Admin and staff accounts cannot use Google or Facebook sign-in; they sign in with their password after accepting the invite.

## Social sign-in

"Continue with Google" and "Continue with Facebook" appear on Login and Sign up once the keys are set. One click signs in an existing customer or creates an account. An existing customer account is linked only when the provider confirms the email.

1. **Google:** Google Cloud Console → APIs & Services → OAuth consent screen, then Credentials → OAuth client ID (Web application). Authorized redirect URI: `https://www.salembookhouse.com/api/auth/google/callback`.
2. **Facebook:** developers.facebook.com → create an app with Facebook Login. Valid OAuth Redirect URI: `https://www.salembookhouse.com/api/auth/facebook/callback`. Set the Privacy Policy URL to `/privacy` and switch the app to Live.

Current state of the live setup: Google is configured and the app is published (In production). The Facebook app exists ("Salem Readers Hub") with Facebook Login, the callback above, App domain `salembookhouse.com` and the privacy, terms and data-deletion links, but it cannot be published until Meta's Business verification is approved, so only app admins and testers can use it for now. Notes from setup: Meta rejects app names that contain "Book"; Google's Publish button stays disabled until the Branding page has a home page and a privacy policy link; the API builds the redirect address from `OAUTH_REDIRECT_BASE`, or else the first entry of `CLIENT_URL`, so one of those must be `https://www.salembookhouse.com`. Never commit the client secrets; set them only in the Render dashboard.
3. Set the keys and `OAUTH_REDIRECT_BASE` on the API host and redeploy. For local testing add the `http://localhost:5173/api/auth/<provider>/callback` URIs too.

Customers who joined with Google or Facebook can set a password later with "Forgot password".

## Categories

Categories are managed in **Admin → Catalogue → Categories** and the storefront reads them straight from the database, so admin changes appear on the next page load with no redeploy.

- Two levels: top-level categories and subcategories (a parent must be top-level).
- The Categories admin page uses a single compact **Add category** row (name, slug, parent, badge, sort, submit) and a hierarchy table with Edit / Hide / Delete links on one line.
- On **Add / Edit product**, staff pick **Category** then **Subcategory** (cascading selects), then **Add category**; assigned paths show as removable chips (`Parent → Child`). A product can belong to more than one category.
- **Sort order** sets the order everywhere. The first 7 shown top-level categories appear in the header nav; the rest go under **MORE**.
- **Badge** (for example `NEW`) shows next to the header tab.
- **Hide** removes a category (and its subcategories) from the header, mega menus, Browse Categories, shop filters and footer. Its `/shop/<slug>` page still works.
- **Delete** is refused while a category has products or subcategories; hide it instead.

`backend/src/scripts/syncCategoryNav.js` sets the initial visibility and order (hides legacy/internal categories such as `kannada` and `best-sellers`). It is safe to re-run.

## Marketing subscribers

**Marketing → Subscribers** lists everyone who opted in (customer accounts and people added by staff).

- Filters: **All**, **Subscribed**, **Unsubscribed**. Counts always show how many are in each state.
- **Unsubscribe** marks them inactive (they stay listed, never emailed). Customers who use the unsubscribe link in a promotion also appear as Unsubscribed.
- People who unsubscribed cannot be re-added by an admin until they opt in again from their account or a sign-up form.
- **Email selected** opens Promotional emails with those addresses pre-ticked. **Export CSV** includes status.

## Payments (Razorpay)

Standard Web Checkout is wired end to end:

| Step | Where |
| --- | --- |
| Create a Razorpay order (amount in paise, minimum ₹1) | `POST /api/payments/create-order` (returns 401 if Razorpay rejects the keys, 500 on other gateway errors) |
| Public key for the checkout modal | `GET /api/payments/config` (the secret never reaches the browser, so no `VITE_` key variable is needed) |
| Check a signature (HMAC-SHA256 of `order_id\|payment_id` with the key secret) | `POST /api/payments/verify` (400 on missing fields or mismatch) |
| Store the order | `POST /api/orders` re-verifies the signature and the paid amount with Razorpay before saving, rejects reused payment ids, and never trusts a client price |

Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in `backend/.env` (gitignored). Without keys, development builds simulate online payments; production builds offer Cash on Delivery only.

**Testing with test keys:** use `rzp_test_…` keys, start both apps, add a book to the cart and choose UPI or card at checkout. Razorpay's published test card is `4100 2800 0000 1007` (CVV `123`, any future expiry); the test UPI id is `success@razorpay` (use `failure@razorpay` to test a failed payment). For go-live, put the **live** key pair in the host's environment (for example the Render dashboard) and never commit either key.

## Production

```bash
docker compose up --build
```

serves the API and the built storefront on port 5000. The repository also deploys as a Vercel frontend (`frontend/vercel.json`) plus a Render API (`render.yaml`).

The API refuses to start in production without a strong `JWT_SECRET` and an `ADMIN_PASSWORD`.

### Vercel + Render

- **Vercel** serves `frontend/`. `frontend/vercel.json` rewrites `/api/*` and `/uploads/*` to the Render API, so the browser only talks to your own domain: login cookies stay first-party and no CORS entry is needed. The storefront always calls `/api`; `VITE_API_URL` is ignored, so a leftover value in the Vercel project settings cannot break a custom domain.
- **Render** runs the `Dockerfile` (`render.yaml`). Set these in the Render dashboard (Environment):

| Variable | Notes |
| --- | --- |
| `NODE_ENV` | `production` (set by `render.yaml`) |
| `DATABASE_URL`, `JWT_SECRET`, `ADMIN_PASSWORD` | required; the API refuses to start without a strong secret and an admin password |
| `CLIENT_URL` | every public site origin, comma-separated, for example `https://www.salembookhouse.com,https://salembookhouse.com,https://ecommerce-book-one.vercel.app`. The **first** entry is the base of password-reset links, so put the main domain first |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | a matching key pair from the same Razorpay mode (`rzp_test_…` or `rzp_live_…`); a mismatch shows "Payment gateway authentication failed" at checkout |
| `SHIPPING_WEBHOOK_SECRET` | carrier webhook secret (`render.yaml` generates one) |
| `ERROR_ALERT_EMAILS` | optional; e.g. `rokeshuvaraj17@gmail.com,sashkumarjay@gmail.com` for live error alerts |
| `SMTP_*`, `MSG91_*`, `ERP_*`, `GOOGLE_*`, `FACEBOOK_*` | optional |

### Go-live checklist

1. Deploy, then open `/api/health` on the live domain (status `ok`).
2. Sign in on the live domain (a login error "Origin not allowed" means the domain is missing from `CLIENT_URL`).
3. Place a Cash on Delivery order and check it in **Admin → Orders**. Sign up with a real address and confirm the verification and welcome emails arrive.
4. Test online payments with **test keys** first (test card above), then switch the Render variables to the live pair and place one small real order.
5. Change the admin password if any database ever used a development default, and keep every key out of git.
6. Make sure the schema step (`npm run db:init`) runs on deploy: new tables and columns (refunds, audit log, returns, `email_verified_at`, product `source` / provenance, `book_images`, users `staff_status` — including `invited` / `active` / `suspended` — `last_sign_in_at`, and `site_errors`) are created there. Set `ERROR_ALERT_EMAILS` on Render if you want alert mail for `/admin/errors`.
7. As admin, open `/api/security/network`. If `ip` is a Vercel or Render address instead of yours, set `TRUST_PROXY_HOPS=4` (Vercel + Render) so rate limits are per visitor.

## Security notes

- Auth uses an httpOnly cookie; state-changing requests from foreign origins are rejected; login, register and reset are rate-limited.
- Order totals are always computed on the server; Razorpay payments are verified by signature and amount, one payment can back only one order (unique index plus a cart lock), and gift cards must be paid online and are voided when their order is cancelled.
- Customer cancellation locks the order row, so overlapping cancels cannot restock twice.
- A password reset ends every login session issued before it (`users.token_version` in the signed token).
- List every browser origin in `CLIENT_URL`, including any custom domain and local preview origin. State-changing browser requests use this exact allowlist. Proxy host headers do not grant access. The storefront calls `/api` on its own origin.
- Carrier endpoints set in the admin must be public `https` URLs (internal and cloud-metadata addresses are refused when saved and again before every call).
- The public ISBN cover route is capped at 40 new upstream lookups a minute with a response-size limit, and guest-cart creation is capped at 600 a minute; guest carts untouched for 30 days are deleted daily.
- Helmet CSP/HSTS headers on the API and security headers in `frontend/vercel.json`.
- Admin uploads accept raster images only; admin-entered links (banners, tracking URLs) must be `http(s)` or same-site paths.
- Guest order links now expire (`orders.guest_token_expires_at`); older links must be requested again. A staff password reset ends that account's existing sessions. Carrier webhooks must name a shipment status and match one order by AWB (and courier when given), otherwise they are refused. Guest carts are never matched to a signed-in user's cart. CSV import and bulk price changes validate every field (length, range, missing values) and keep the stored discount percentage in step with MRP and price. `/api/pages` and the admin CMS page editor were removed; the Help Centre, Terms and Privacy pages are static (see `StoreHelp.tsx`).
- Mail that visitors can trigger (password reset, verification, guest order link) is capped per recipient and overall each hour; reset and verification tokens are single-use and stored hashed; unverified accounts lose their password if the same address later signs in with Google or Facebook.
- Promotional email goes only to customers who ticked the unticked-by-default offers box (sign-up or account page); every promotion has an unsubscribe link that works without signing in.
- Gift-card codes carry 64 bits of randomness; carrier API secrets are encrypted at rest.
- Staff screens never show email bodies (they can hold reset and verification links), and non-admin staff see gift-card codes masked. Coupons never discount gift cards, the per-customer coupon limit also counts the delivery phone, shipping is priced from the entered pincode (the address must agree), and promotions go only to verified opt-ins.
- Dependencies are kept at zero known advisories (`npm audit --omit=dev` in `backend` and `frontend`).
- Report vulnerabilities privately to the store owner rather than opening a public issue.

## Tests

`cd backend && npm test` runs unit tests and an integration suite against a throwaway embedded Postgres (checkout, cancellations, refunds, returns, gift cards, CSV import, staff permissions, guest access, email verification, account emails, two-factor sign-in). It needs no database or keys.

## Scripts

One-off data scripts live in `backend/src/scripts` (cover backfill, category cleanup and nav sync, banner image helpers, product provenance migration, Kannada → Tamil migration, …). Read the header comment before running any of them; `replaceKannadaWithTamil.js` is a dry run unless you pass `--apply`.

## Product images and provenance

- Gallery rows live in `book_images`; `books.image_url` is always the cover (first gallery image).
- Create/edit in **Admin → Products** records `source` (`admin` / `staff` / `erp`), `created_by_name`, `updated_by_name` and timestamps. ERP sync sets `source=erp` and `source_label` like `Rokesh ERP · host · mrerp_….xxxx` plus who ran the sync. The provenance card sits under the save actions on the form.
- Storefront product pages already show multiple images when more than one gallery URL exists.

### Storefront help and policies

The Help Centre (`/help` and `/faq`), Shipping, Returns, About, Contact, Terms and Privacy are maintained in `frontend/src/pages/StoreHelp.tsx` and linked in the storefront footer. Existing CMS rows are retained for historical reference. The storefront renders these pages from source and no longer reads the CMS table.

## Credits

Developed by [MR ROKESH SOFTWARES](https://www.mrrokesh.com/).
