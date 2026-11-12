# Salem Book House

Online bookstore for Salem Book House, Salem, Tamil Nadu: **Vite + React + TypeScript** storefront, **Node.js + Express** API, **PostgreSQL**.

## Features

- Catalogue with nested categories (Books → Tamil, Fiction, …), multi-select category and language filters, search, author and publisher pages
- Cart (guest and signed-in), wishlist, saved addresses, coupons and gift cards, pincode delivery check
- Guest and signed-in checkout: Cash on Delivery, or UPI / cards / net banking through Razorpay. Any product can be marked "Cash on delivery available" off in the admin; such products show an "Online payment only" notice on the product page, and checkout then offers only the online methods (the server refuses COD for them too). A short success chime plays when an order is placed
- Sign in / sign up with email, Google or Facebook; email verification on sign-up, welcome, new sign-in and password-changed emails
- Order tracking and GST invoice download for signed-in customers (own orders only), cancellations, item-level returns with refunds, and a secure emailed link for guest orders
- Reviews, store locator, exam-prep section, CMS pages (About, Contact, FAQ, Terms, Privacy)
- New-order alerts in the admin: a chime, a toast and a desktop notification when a customer places an order while the admin is open (checked every 15 seconds by a background worker, so it keeps working while the tab is behind other tabs or apps; the bell in the top bar mutes it and your choice is remembered; leave the admin tab open, and click the page once so the browser allows sound and notifications)
- Admin sign-in at `/admin/login` with a brand panel and centred form (collapses to a single card on phones)
- Admin panel at `/admin` with a dark sidebar of collapsible groups with live count badges (orders to action, open returns, pending refunds, low stock) and a daily email usage meter, a jump-to-page search, a dashboard of pending actions, low stock and recent orders, and a layout that works on phones (separate sign-in, no storefront chrome): products, categories, orders, customers, reviews, coupons and banners, CMS pages, email outbox, staff accounts, multi-carrier shipping (Shiprocket, Delhivery, Blue Dart, DTDC, Shadowfax), ERP product sync
- Back-office operations in the admin: inventory and stock history, CSV import and bulk edits, payments and refunds, returns, sales reports, gift cards, store settings and delivery coverage, audit history, and optional authenticator-app two-factor sign-in
- Branded HTML emails for every message (welcome with a real coupon, order receipt, shipping status tracker, returns, refunds, password reset, security alerts) and an admin **Promotional emails** section for seasonal sales (Diwali, Pongal, flash sales): templates, coupon attachment, preview, test send, send to opted-in customers, unsubscribe link and delivery stats, plus a **Subscribers** page (who agreed and when, add a person with a consent confirmation, remove, export CSV); a campaign goes to everyone subscribed or only the people you tick
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
| `ROKESH_NOTIFY_API_URL`, `ROKESH_NOTIFY_API_KEY` | Outgoing email through Rokesh Notify (preferred). Needs `salembookhouse.com` verified in Notify (SPF + DKIM DNS records). Mail is sent from `MAIL_FROM`, default `Salem Book House <noreply@salembookhouse.com>` |
| `SMTP_*` | Fallback email via SMTP, used only if Rokesh Notify is not set. With neither, mail stays in Admin → Email outbox (password-reset emails will not be delivered) |
| `SHIPPING_WEBHOOK_SECRET` | Shared secret for carrier tracking webhooks |
| `ERP_API_URL` / `ERP_API_KEY` | Optional product and stock sync |

## Admin portal and staff

The admin portal lives at `/admin` with its own sign-in page (`/admin/login`). The storefront does not link to it, and the storefront `/login` is for customers only.

Access is managed in **Admin → Store → Staff & roles**:

- **Admins** have full access, including staff and role management.
- **Staff** get a **role**. A role is a name plus the sections it can open: Dashboard, Orders, Products, Categories, Customers, Reviews, Shipping partners, Banners & coupons, CMS pages, Email outbox. Staff only see those sections in the menu.
- A starter role, **Order manager** (Orders only), is created on first run. Edit it or create your own (for example "Catalogue editor" with Products and Categories).
- Changing a role's sections applies to everyone with that role on their next request. A role cannot be deleted while staff have it.
- Admins add staff with a name, email, password (shared with them directly; no email is sent) and role, change a member's role, reset passwords, and remove access.
- **Remove access** turns the account back into a normal customer; order history is kept. You cannot change or remove your own access, or remove the last admin.
- Permissions are enforced by the API (`requireBackOffice` / `requirePermission` and the module map in `backend/src/routes/admin.js`), not just hidden in the menu.
- The Orders section includes setting an order to cancelled or refunded, which issues the Razorpay refund.
- Admin and staff accounts cannot use Google or Facebook sign-in; they sign in with their password.

## Social sign-in

"Continue with Google" and "Continue with Facebook" appear on Login and Sign up once the keys are set. One click signs in an existing customer or creates an account. An existing customer account is linked only when the provider confirms the email.

1. **Google:** Google Cloud Console → APIs & Services → OAuth consent screen, then Credentials → OAuth client ID (Web application). Authorized redirect URI: `https://www.salembookhouse.com/api/auth/google/callback`.
2. **Facebook:** developers.facebook.com → create an app with Facebook Login. Valid OAuth Redirect URI: `https://www.salembookhouse.com/api/auth/facebook/callback`. Set the Privacy Policy URL to `/privacy` and switch the app to Live.
3. Set the keys and `OAUTH_REDIRECT_BASE` on the API host and redeploy. For local testing add the `http://localhost:5173/api/auth/<provider>/callback` URIs too.

Customers who joined with Google or Facebook can set a password later with "Forgot password".

## Categories

Categories are managed in **Admin → Catalogue → Categories** and the storefront reads them straight from the database, so admin changes appear on the next page load with no redeploy.

- Two levels: top-level categories and subcategories (a parent must be top-level).
- **Sort order** sets the order everywhere. The first 7 shown top-level categories appear in the header nav; the rest go under **MORE**.
- **Badge** (for example `NEW`) shows next to the header tab.
- **Hide** removes a category (and its subcategories) from the header, mega menus, Browse Categories, shop filters and footer. Its `/shop/<slug>` page still works.
- **Delete** is refused while a category has products or subcategories; hide it instead.

`backend/src/scripts/syncCategoryNav.js` sets the initial visibility and order (hides legacy/internal categories such as `kannada` and `best-sellers`). It is safe to re-run.

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
| `SMTP_*`, `MSG91_*`, `ERP_*`, `GOOGLE_*`, `FACEBOOK_*` | optional |

### Go-live checklist

1. Deploy, then open `/api/health` on the live domain (status `ok`).
2. Sign in on the live domain (a login error "Origin not allowed" means the domain is missing from `CLIENT_URL`).
3. Place a Cash on Delivery order and check it in **Admin → Orders**. Sign up with a real address and confirm the verification and welcome emails arrive.
4. Test online payments with **test keys** first (test card above), then switch the Render variables to the live pair and place one small real order.
5. Change the admin password if any database ever used a development default, and keep every key out of git.
6. Make sure the schema step (`npm run db:init`) runs on deploy: new tables and columns (refunds, audit log, returns, `email_verified_at`) are created there.
7. As admin, open `/api/security/network`. If `ip` is a Vercel or Render address instead of yours, set `TRUST_PROXY_HOPS=2` so rate limits are per visitor.

## Security notes

- Auth uses an httpOnly cookie; state-changing requests from foreign origins are rejected; login, register and reset are rate-limited.
- Order totals are always computed on the server; Razorpay payments are verified by signature and amount, one payment can back only one order (unique index plus a cart lock), and gift cards must be paid online and are voided when their order is cancelled.
- Customer cancellation locks the order row, so overlapping cancels cannot restock twice.
- A password reset ends every login session issued before it (`users.token_version` in the signed token).
- Only origins listed in `CLIENT_URL`, or the site's own host, may make state-changing requests; shared domains such as `*.vercel.app` are not trusted by name. The storefront always calls `/api` on its own origin.
- Carrier endpoints set in the admin must be public `https` URLs (internal and cloud-metadata addresses are refused when saved and again before every call).
- The public ISBN cover route is capped at 40 new upstream lookups a minute with a response-size limit, and guest-cart creation is capped at 600 a minute; guest carts untouched for 30 days are deleted daily.
- Helmet CSP/HSTS headers on the API and security headers in `frontend/vercel.json`.
- Admin uploads accept raster images only; admin-entered links (banners, tracking URLs) must be `http(s)` or same-site paths.
- Mail that visitors can trigger (password reset, verification, guest order link) is capped per recipient and overall each hour; reset and verification tokens are single-use and stored hashed; unverified accounts lose their password if the same address later signs in with Google or Facebook.
- Promotional email goes only to customers who ticked the unticked-by-default offers box (sign-up or account page); every promotion has an unsubscribe link that works without signing in.
- Gift-card codes carry 64 bits of randomness; carrier API secrets are encrypted at rest.
- Staff screens never show email bodies (they can hold reset and verification links), and non-admin staff see gift-card codes masked. Coupons never discount gift cards, the per-customer coupon limit also counts the delivery phone, shipping is priced from the entered pincode (the address must agree), and promotions go only to verified opt-ins.
- Dependencies are kept at zero known advisories (`npm audit --omit=dev` in `backend` and `frontend`).
- Report vulnerabilities privately to the store owner rather than opening a public issue.

## Tests

`cd backend && npm test` runs unit tests and an integration suite against a throwaway embedded Postgres (checkout, cancellations, refunds, returns, gift cards, CSV import, staff permissions, guest access, email verification, account emails, two-factor sign-in). It needs no database or keys.

## Scripts

One-off data scripts live in `backend/src/scripts` (cover backfill, category cleanup and nav sync, Kannada → Tamil migration, …). Read the header comment before running any of them; `replaceKannadaWithTamil.js` is a dry run unless you pass `--apply`.

### CMS pages

About, Contact, FAQ, Terms and Privacy are edited in **Admin → CMS pages**. The startup seed only creates pages that are missing and never overwrites edited content. To reset all five to the full default text, run `node src/scripts/ensureCmsAndFooterPages.js` in `backend`.

## Credits

Developed by [MR ROKESH SOFTWARES](https://www.mrrokesh.com/).
