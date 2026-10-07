# Salem Book House — client handoff

Single-store bookstore (Sapna-style). Client only needs API keys + catalog/ERP.

## Live stack

| Area | Where |
|------|--------|
| Storefront | Vercel (frontend) |
| API | Render (`ecommerce-book-rbl2`) |
| Database | Rokesh Postgres `DATABASE_URL` |
| Admin | `/admin` — `admin@salembookhouse.com` (change password after handoff) |

## Required env (Render)

Copy from `backend/.env.example`. Minimum for a working shop:

- `DATABASE_URL`, `JWT_SECRET`, `CLIENT_URL` (include Vercel URL)
- `ERP_API_URL`, `ERP_API_KEY` (Muruga `mrerp_…` store key)
- Optional live pay: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`
- Optional email/SMS: `SMTP_*`, `MSG91_*`
- Couriers: set in **Admin → Shipping partners** (Shiprocket / Shadowfax / BlueDart / Delhivery / DTDC / Manual) or env vars above
- `SHIPPING_WEBHOOK_SECRET` for carrier webhooks → `/api/shipping/webhooks/{carrier}?secret=…`

## Admin runbook

1. **Products** — sync ERP (Products → Sync from ERP) or add manually.
2. **Shipping** — enable a partner, paste credentials, set default, turn on auto-create if desired.
3. **Orders** — open order → **Create shipment** (or auto). Paste `AWB ABC123` in note to force manual AWB.
4. **Reviews** — hide spam under Reviews.
5. **Invoice** — open order detail → Invoice link (HTML, print to PDF).

## Customer flows

- Header pincode check → checkout uses same fee/ETA API.
- Track: `/track` with order number + phone (shows AWB/tracking URL when shipped).
- Reviews: only after **delivered**, one per user per book.
- Return: within 7 days of delivery → restock + Razorpay refund when configured.

## Smoke test

1. Home loads sections + author of the day  
2. Shop / PDP / add to cart  
3. Checkout COD → order appears in admin  
4. Create shipment (or configure Shiprocket + auto)  
5. Track page shows timeline  
6. Mark delivered → submit verified review  
7. Request return → payment_status refunded when paid online  

## Out of scope

Multi-vendor marketplace, native apps, scraping Sapna CDN ongoing.
