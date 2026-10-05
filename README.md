# Salem Book House

Full-stack bookstore inspired by Sapna Online — **Vite + React** frontend, **Node.js + Express** backend, **PostgreSQL**.

## Quick start

```bash
cd backend && npm install && npm run dev
cd frontend && npm install && npm run dev
```

Store: http://localhost:5173/ · API: http://localhost:5000/

Set `DATABASE_URL` in `backend/.env` for Rokesh Cloud (or any) Postgres. Leave it empty for embedded Postgres.

Demo: `demo@salembookhouse.com` / `Demo@123`  
Admin: `admin@salembookhouse.com` / `Admin@123`  
Coupons: `WELCOME10`, `SALEM50`

## Payments and email

- **Razorpay:** set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`. Without keys, UPI/card stay simulated.
- **SMTP:** set `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`. Without SMTP, order/reset mail is stored in Admin → Email outbox.

## Production (Docker)

```bash
docker compose up --build
```

Serves the API and the built storefront on port 5000 using `DATABASE_URL` from `backend/.env`.
