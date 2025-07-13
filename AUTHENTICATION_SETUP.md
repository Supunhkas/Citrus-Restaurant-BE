# Authentication System Setup Guide

This guide will help you set up the authentication system for the Citrus Restaurant Backend.

## Prerequisites

- Node.js (v16 or higher)
- MongoDB (running locally or accessible)
- npm or yarn

## Installation

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file in the root directory with the following variables:

```env
# Application
PORT=3000

# Database
MONGODB_URI=mongodb://localhost:27017/citrus-restaurant

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d

# Environment
NODE_ENV=development
```

## Running the Application

1. Start the development server:

```bash
npm run start:dev
```

2. The application will be available at `http://localhost:3000`

## API Endpoints

### Authentication Endpoints

#### Register User

- **POST** `/auth/register`
- **Body:**

```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe"
}
```

#### Login

- **POST** `/auth/login`
- **Body:**

```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

#### Refresh Token

- **POST** `/auth/refresh`
- **Body:**

```json
{
  "refreshToken": "your-refresh-token"
}
```

#### Logout

- **POST** `/auth/logout`
- **Headers:** `Authorization: Bearer <access-token>`

#### Get Profile

- **GET** `/auth/profile`
- **Headers:** `Authorization: Bearer <access-token>`

#### Verify Email

- **GET** `/auth/verify-email/:token`

#### Forgot Password

- **POST** `/auth/forgot-password`
- **Body:**

```json
{
  "email": "user@example.com"
}
```

#### Reset Password

- **POST** `/auth/reset-password`
- **Body:**

```json
{
  "token": "reset-token",
  "newPassword": "NewSecurePass123!"
}
```

## Features

### Security Features

- **Password Hashing**: Uses Argon2 for secure password hashing
- **JWT Authentication**: Stateless authentication with access and refresh tokens
- **Input Validation**: Comprehensive validation using class-validator
- **CORS Enabled**: Cross-origin resource sharing enabled
- **Environment Configuration**: Secure configuration management

### User Management

- User registration with email verification
- Secure login with password validation
- Password reset functionality
- User profile management
- Account deactivation

### Database

- MongoDB with Mongoose ODM
- Proper indexing for performance
- Timestamps for audit trails
- Soft delete capability

## Best Practices Implemented

1. **Security**:
   - Strong password requirements
   - Secure password hashing with Argon2
   - JWT token management
   - Input validation and sanitization

2. **Code Structure**:
   - Modular architecture
   - Separation of concerns
   - Dependency injection
   - TypeScript for type safety

3. **Error Handling**:
   - Comprehensive error responses
   - Proper HTTP status codes
   - Validation error messages

4. **Performance**:
   - Database indexing
   - Efficient queries
   - Async/await patterns

## Testing

To run tests:

```bash
npm run test
```

For e2e tests:

```bash
npm run test:e2e
```

## Production Considerations

1. **Environment Variables**: Update all sensitive values in production
2. **JWT Secret**: Use a strong, unique secret key
3. **Database**: Use a production MongoDB instance
4. **HTTPS**: Enable HTTPS in production
5. **Rate Limiting**: Implement rate limiting for auth endpoints
6. **Logging**: Add comprehensive logging
7. **Monitoring**: Set up application monitoring

## Troubleshooting

### Common Issues

1. **MongoDB Connection Error**: Ensure MongoDB is running and accessible
2. **JWT Errors**: Check JWT_SECRET is properly set
3. **Validation Errors**: Ensure request body matches DTO requirements
4. **Port Conflicts**: Change PORT in .env if 3000 is occupied

### Logs

Check the console output for detailed error messages and debugging information.
