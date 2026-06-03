# Backend Architecture

## Stack

| Layer | Technology |
|-------|------------|
| Framework | NestJS 10 |
| Language | TypeScript |
| Database | MongoDB via Mongoose |
| Auth | JWT (Passport.js) + Argon2 hashing |
| Payments | Stripe Checkout Sessions |
| Real-time | Socket.io 4 |
| Email | Brevo / SendGrid / Nodemailer |
| Push | Expo SDK + Firebase FCM |
| Validation | class-validator + class-transformer |

---

## Module Structure

```
src/
├── app.module.ts          # Root module
├── main.ts                # Bootstrap (Helmet, CORS, validation pipe)
├── config/
│   └── configuration.ts   # Typed env config
├── schema/                # Mongoose schemas (shared across modules)
│   ├── user/
│   ├── order/
│   ├── reservation/
│   ├── menu/
│   └── counter/
├── modules/
│   ├── auth/              # JWT auth, guards, strategies
│   ├── users/             # User profile
│   ├── menu/              # Menu items + categories
│   ├── orders/            # Pickup order lifecycle
│   ├── reservation/       # Reservation lifecycle
│   ├── payments/          # Stripe integration
│   ├── notifications/     # Socket.io gateway + push notifications
│   ├── dashboard/         # Admin analytics
│   ├── email/             # Email service abstraction
│   └── firebase/          # Firebase Cloud Messaging
└── common/
    ├── guards/            # JwtAuthGuard, RolesGuard, ThrottleGuard
    ├── decorators/        # @Public(), @Roles(), @CurrentUser()
    └── utils/
        └── event-bus.service.ts  # Async event handling
```

---

## Key Schemas

### Pickup Order
```
status: PAYMENT_PENDING | PENDING | CONFIRMED | READY | COMPLETED | CANCELLED
paymentStatus: NONE | PENDING | COMPLETED | FAILED
```

### Reservation
```
type: STANDARD | BUFFET
status: PENDING | CONFIRMED | APPROVED | REJECTED | PAYMENT_PENDING
paymentStatus: NONE | PENDING | COMPLETED | FAILED
pricePerPerson?: number   (buffet only, set server-side)
buffetTotal?: number      (buffet only, guests × pricePerPerson)
```

### User
```
role: 'user' | 'admin'
failedLoginAttempts: number  (lockout after 6)
lockUntil?: Date             (15-minute lockout)
```

---

## Event Bus Pattern

Stripe webhooks are decoupled from business logic via `EventBusService`:

```
POST /payments/webhook
  → verify Stripe signature
  → emit 'payment.order.completed' or 'payment.reservation.completed'
  → OrdersService / ReservationService handles via event listener
```

This prevents timeout issues with webhook handlers.

---

## Auth Architecture

```
Request → GlobalThrottlerGuard → JwtAuthGuard → RolesGuard → Controller
```

- `@Public()` decorator bypasses `JwtAuthGuard`
- `@Roles('admin')` enforces admin-only access
- Refresh tokens are hashed (not stored plain) and rotated on use
- Failed login tracking → account lockout (6 attempts = 15 min lock)

---

## Real-time Notifications (Socket.io)

Gateway: `NotificationsGateway` (`/notifications` namespace)

- Admins join `admin-room` on connection (JWT verified)
- Events emitted to admin-room:
  - `reservationCreated` — new reservation placed
  - `reservationConfirmed` — guest confirmed email code
  - `pickupOrderCreated` — new pickup order placed

Frontend admin listens via `useSocketNotifications()` hook.

---

## Buffet Reservation Flow

1. Guest selects BUFFET type on reservation form
2. Frontend sends `type: 'BUFFET'` in request body
3. Backend computes `pricePerPerson` from `BUFFET_PRICE_PER_HEAD` env var
4. `buffetTotal = guests × pricePerPerson` stored on reservation
5. Stripe session created for full `buffetTotal` amount (always required)
6. Guest pays → webhook updates status → admin sees CONFIRMED buffet booking
