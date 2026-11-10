# Salem Book House

Online bookstore for Salem Book House, Salem, Tamil Nadu: **Vite + React + TypeScript** storefront, **Node.js + Express** API, **PostgreSQL**.

## Features

- Catalogue with nested categories (Books → Tamil, Fiction, …), multi-select category and language filters, search, author and publisher pages
- Cart (guest and signed-in), wishlist, saved addresses, coupons and gift cards, pincode delivery check
- Guest and signed-in checkout: Cash on Delivery, or UPI / cards / net banking through Razorpay
- Order tracking by order number and phone, cancellations, returns, GST invoice
- Reviews, store locator, exam-prep section, CMS pages (About, Contact, FAQ, Terms, Privacy)
- Admin panel: products, orders, customers, reviews, coupons and banners, CMS pages, email outbox, multi-carrier shipping (Shiprocket, Delhivery, Blue Dart, DTDC, Shadowfax), ERP product sync
- Responsive layout (phones from 320px up), toast feedback, 404 and error screens

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
| `SMTP_*` | Outgoing email. Without SMTP, mail goes to Admin → Email outbox (password-reset emails will not be delivered) |
| `SHIPPING_WEBHOOK_SECRET` | Shared secret for carrier tracking webhooks |
| `ERP_API_URL` / `ERP_API_KEY` | Optional product and stock sync |

## Payments (Razorpay)

Standard Web Checkout is wired end to end:

| Step | Where |
| --- | --- |
| Create a Razorpay order (amount in paise, minimum ₹1) | `POST /api/payments/create-order` (returns 401 if Razorpay rejects the keys, 500 on other gateway errors) |
| Public key for the checkout modal | `GET /api/payments/config` (the secret never reaches the browser, so no `VITE_` key variable is needed) |
| Check a signature (HMAC-SHA256 of `order_id\|payment_id` with the key secret) | `POST /api/payments/verify` (400 on missing fields or mismatch) |
| Store the order | `POST /api/orders` re-verifies the signature and the paid amount with Razorpay before saving, rejects reused payment ids, and never trusts a client price |

Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in `backend/.env` (gitignored). Without keys, development builds simulate online payments; production builds offer Cash on Delivery only.

**Testing with test keys:** use `rzp_test_…` keys, start both apps, add a book to the cart and choose UPI or card at checkout. Razorpay's published test card is `4100 2800 0000 1007` (CVV `123`, any future expiry); the test UPI id is `test@razorpay`. For go-live, put the **live** key pair in the host's environment (for example the Render dashboard) and never commit either key.

## Production

```bash
docker compose up --build
```

serves the API and the built storefront on port 5000. The repository also deploys as a Vercel frontend (`frontend/vercel.json`) plus a Render API (`render.yaml`).

The API refuses to start in production without a strong `JWT_SECRET` and an `ADMIN_PASSWORD`.

## Security notes

- Auth uses an httpOnly cookie; state-changing requests from foreign origins are rejected; login, register and reset are rate-limited.
- Order totals are always computed on the server; Razorpay payments are verified by signature and amount, one payment can back only one order (unique index plus a cart lock), and gift cards must be paid online and are voided when their order is cancelled.
- Customer cancellation locks the order row, so overlapping cancels cannot restock twice.
- Helmet CSP/HSTS headers on the API and security headers in `frontend/vercel.json`.
- Admin uploads accept raster images only.
- Report vulnerabilities privately to the store owner rather than opening a public issue.

## Scripts

One-off data scripts live in `backend/src/scripts` (cover backfill, category cleanup, Kannada → Tamil migration, …). Read the header comment before running any of them; `replaceKannadaWithTamil.js` is a dry run unless you pass `--apply`.
