# Deployment Guide

## Prerequisites

- Node.js 20+
- MongoDB (Atlas or self-hosted)
- Stripe account (for payments)
- Brevo or SendGrid account (for emails)

---

## Environment Variables

Create a `.env` file in the project root:

```env
# Server
PORT=3001
NODE_ENV=production

# MongoDB
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/citrus

# JWT
JWT_SECRET=your-strong-jwt-secret-here
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=30d

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CURRENCY=aud

# Temporary payment bypass (remove once Stripe is live) — "true" skips Stripe
# entirely and sends pickup orders / reservations straight to the admin
# approve/reject queue instead. Anything else (or unset) keeps Stripe required.
PICKUP_PAYMENT_BYPASS=false
RESERVATION_PAYMENT_BYPASS=false

# Frontend URL (for redirects)
FRONTEND_URL=https://your-domain.com

# Email — Brevo (preferred)
BREVO_API_KEY=xkeysib-...
EMAIL_FROM=noreply@citrusrestaurant.com.au
EMAIL_FROM_NAME=Citrus Restaurant

# Rate limiting
THROTTLE_TTL=60
THROTTLE_LIMIT=100
AUTH_THROTTLE_TTL=60
AUTH_THROTTLE_LIMIT=5

# Reservations
MAX_CAPACITY_PER_SLOT=40
RESERVATION_DEPOSIT_THRESHOLD=5
RESERVATION_DEPOSIT_AMOUNT=30
BUFFET_PRICE_PER_HEAD=35

# Socket.io CORS
ALLOWED_ORIGINS=https://your-domain.com

# Firebase (optional — for push notifications)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

---

## Local Development

```bash
npm install
cp .env.example .env   # fill in values
npm run start:dev      # NestJS watch mode
```

API available at `http://localhost:3001`

---

## Production Build

```bash
npm run build
npm run start:prod
```

---

## Stripe Webhook Setup

1. Install Stripe CLI: `stripe listen --forward-to localhost:3001/payments/webhook`
2. In production, configure webhook in Stripe Dashboard:
   - Endpoint: `https://your-api-domain.com/payments/webhook`
   - Events to listen: `checkout.session.completed`
3. Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`

---

## Deployment Platforms

### Render (recommended)
1. Connect GitHub repo
2. Build command: `npm run build`
3. Start command: `npm run start:prod`
4. Add all environment variables in the Render dashboard

### Railway / Fly.io
Similar process — set env vars in the platform dashboard.

---

## Database Indexes

MongoDB indexes are created automatically via Mongoose schema definitions. Key indexes:
- `users.email` (unique)
- `reservations.reservationId` (unique)
- `reservations.reservationDate`
- `orders.status`
- `menu.items.category`

---

## Health Check

`GET /` returns `200 OK` — use this for uptime monitoring.
