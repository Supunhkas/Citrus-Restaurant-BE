# API Reference

Base URL: `http://localhost:3001` (dev) | configured via `BACKEND_API_URL` env var

All protected endpoints require `Authorization: Bearer <accessToken>` header.
Admin-only endpoints additionally require `role: admin` on the JWT payload.

---

## Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | Public | Register customer account |
| POST | `/auth/login` | Public | Customer login |
| POST | `/auth/admin-login` | Public | Admin login (role-checked) |
| POST | `/auth/refresh` | Public | Refresh access token |
| GET | `/auth/verify-email/:token` | Public | Verify email address |
| POST | `/auth/forgot-password` | Public | Request password reset email |
| POST | `/auth/reset-password` | Public | Reset password with token |
| GET | `/auth/profile` | Auth | Get current user profile |
| POST | `/auth/logout` | Auth | Logout (invalidates refresh token) |

---

## Menu

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/menu/items` | Public | List items (query: `category`, `featured`, `search`) |
| GET | `/menu/items/:id` | Public | Get single item |
| GET | `/menu/categories` | Public | List categories |
| GET | `/menu/admin/items` | Admin | List all items (including unavailable) |
| POST | `/menu/admin/items` | Admin | Create item |
| PATCH | `/menu/admin/items/:id` | Admin | Update item |
| PATCH | `/menu/admin/items/:id/toggle-availability` | Admin | Toggle availability |
| DELETE | `/menu/admin/items/:id` | Admin | Delete item |
| GET | `/menu/admin/categories` | Admin | List categories (admin) |
| POST | `/menu/admin/categories` | Admin | Create category |
| PATCH | `/menu/admin/categories/:id` | Admin | Update category |
| DELETE | `/menu/admin/categories/:id` | Admin | Delete category |

---

## Orders (Pickup)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/orders/pickup` | Public | Create pickup order (guest or authenticated) |
| GET | `/orders/payment-status/:orderId` | Public | Poll payment status |
| GET | `/orders/admin` | Admin | List all orders (query: `status`, `page`, `limit`) |
| PATCH | `/orders/admin/:id/status` | Admin | Update order status |

### Order Status Enum
`PAYMENT_PENDING → PENDING → CONFIRMED → READY → COMPLETED / CANCELLED`

### POST /orders/pickup Body
```json
{
  "customerName": "string",
  "customerPhone": "string",
  "customerEmail": "string (optional)",
  "items": [{ "menuItemId": "string", "name": "string", "price": 0, "quantity": 1 }],
  "subtotal": 0,
  "tax": 0,
  "total": 0,
  "notes": "string (optional)"
}
```

---

## Reservations

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/reservations/create` | Public | Create reservation (standard or buffet) |
| POST | `/reservations/confirm` | Public | Confirm reservation with email code |
| POST | `/reservations/resend-confirmation` | Public | Resend confirmation code |
| GET | `/reservations/list` | Auth | List reservations (user sees own, admin sees all) |
| PATCH | `/reservations/:id/approve` | Admin | Approve reservation |
| PUT | `/reservations/:id/reject` | Admin | Reject with reason |

### Reservation Types
- `STANDARD` — Regular table booking
- `BUFFET` — Pre-paid per-person buffet (payment always required)

### POST /reservations/create Body
```json
{
  "name": "string",
  "email": "string",
  "contactNumber": "string",
  "reservationDate": "YYYY-MM-DD",
  "reservationTime": "HH:MM",
  "guests": 4,
  "specialRequests": "string (optional)",
  "confirmationMethod": "email",
  "type": "STANDARD | BUFFET"
}
```

---

## Payments

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/payments/webhook` | Stripe-signed | Stripe webhook handler |

---

## Dashboard (Admin)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/dashboard/kpi-data` | Admin | Today's KPI metrics |
| GET | `/dashboard/today-reservations` | Admin | Today's reservation list |
| GET | `/dashboard/weekly-stats` | Admin | 7-day revenue + covers stats |
