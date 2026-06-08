# Password Auth API Redesign

Date: 2026-06-08
Project: `/Users/quzhenrong/rpas-lms`
Status: Draft for user review

## Goal

Redesign the login and registration API around a simple account model:

- Users can log in with Google, Apple, email, phone, or username.
- Local accounts always authenticate with a password.
- New local registrations require email and password.
- Username and phone are optional profile/login aliases.
- Email verification is required before a local password account can log in.

This replaces the current mixed code-login and username-registration flow, which makes registration and login responsibilities hard to reason about.

## Assumptions

- The latest clarification supersedes the earlier requirement that username is required. Username is optional.
- Phone is optional and does not need SMS verification in this phase.
- Email verification uses the existing 6-digit verification-code service, but only for registration email verification.
- Password reset, phone verification, and production email provider selection are out of scope for this redesign.

## User-Facing Flow

### Register

The registration form submits four explicit fields:

```json
{
  "email": "pilot@example.com",
  "password": "correct horse battery staple",
  "username": "pilotone",
  "phone": "+16045551234"
}
```

Rules:

- `email` is required and must be valid.
- `password` is required and must meet the existing password policy.
- `username` is optional, normalized to lowercase, and unique when provided.
- `phone` is optional, normalized to the existing phone format, and unique when provided.
- The server creates or updates a pending local user with `emailVerifiedAt = null`.
- The server sends a 6-digit email verification code.
- The account cannot log in until the email code is verified.

### Verify Registration Email

The email verification form submits:

```json
{
  "email": "pilot@example.com",
  "code": "123456"
}
```

Rules:

- The server verifies the active email code.
- On success, it marks `emailVerifiedAt`.
- The UI can then sign in with the same email and password.

### Login

The password login path accepts exactly one local identifier plus password:

```json
{ "email": "pilot@example.com", "password": "secret-password" }
```

or:

```json
{ "phone": "+16045551234", "password": "secret-password" }
```

or:

```json
{ "username": "pilotone", "password": "secret-password" }
```

Rules:

- Exactly one of `email`, `phone`, or `username` must be present.
- `password` is always required.
- The matched user must have `hashedPassword`.
- The matched user must have `emailVerifiedAt`.
- Phone and username login are allowed after the account's required email has been verified.
- Invalid credentials return a generic authentication failure through NextAuth.

Google and Apple continue to use OAuth. If the provider returns a verified email, that email is treated as verified and can be linked to an existing local account.

## API Surface

Keep the public API small:

```text
POST /api/auth/register
POST /api/auth/register/verify-email
GET  /api/auth/username/check?username=...
```

NextAuth remains responsible for sessions:

```text
POST /api/auth/signin credentials provider
GET/POST /api/auth/[...nextauth]
```

The old code-login route handlers should no longer be part of the main login flow:

```text
POST /api/auth/code/request
POST /api/auth/code/verify
POST /api/auth/register/username
```

These old route handlers should return `410 Gone` or be removed during implementation. They must not create sessions or users after this redesign. The verification-code service itself should stay because registration email verification uses it internally.

## Server Responsibilities

### `POST /api/auth/register`

Request body:

```ts
{
  email: string;
  password: string;
  username?: string;
  phone?: string;
}
```

Behavior:

- Validate and normalize fields.
- Reject duplicate verified email accounts.
- Reject taken username or phone aliases.
- Hash the password.
- Create a pending user, or refresh an existing unverified pending account for the same email.
- Request and send an email verification code.
- Return `{ ok: true, emailVerificationRequired: true }`.

### `POST /api/auth/register/verify-email`

Request body:

```ts
{
  email: string;
  code: string;
}
```

Behavior:

- Verify the active email code.
- Mark the matching user's `emailVerifiedAt`.
- Create or update the `email` user identity if the identity table remains in use.
- Return `{ ok: true }`.

### Credentials Provider

The credentials provider should accept:

```ts
{
  email?: string;
  phone?: string;
  username?: string;
  password: string;
}
```

Behavior:

- Validate that exactly one identifier is present.
- Normalize the identifier.
- Find the user by the matching field.
- Reject when the user does not exist, has no password, has an unverified email, or the password does not match.
- Return the user id, email, display name or username, and access tier.

## Data Model

The current Prisma model already supports the target shape:

- `User.email`
- `User.phone`
- `User.username`
- `User.hashedPassword`
- `User.emailVerifiedAt`
- `User.phoneVerifiedAt`
- `UserIdentity`
- `VerificationCode`

No new Prisma tables are required for this redesign. The implementation should keep schema changes minimal unless tests expose a missing constraint.

## Error Handling

Use specific validation errors for registration form mistakes:

- invalid email
- weak password
- username unavailable
- phone unavailable
- email already registered
- invalid or expired verification code

Use generic credential failure for login so the API does not reveal which part of the credential set failed.

## Testing Strategy

Write tests first for each behavior change:

- Registration creates a pending user with hashed password and sends an email code.
- Registration rejects duplicate verified email, username, and phone values.
- Email verification consumes a code and marks `emailVerifiedAt`.
- Credentials login succeeds with email, phone, and username after email verification.
- Credentials login rejects unverified accounts.
- Credentials login rejects requests with zero or multiple local identifiers.
- Google and Apple account creation/linking still preserves verified email behavior.

Focused route tests should cover the HTTP payloads. Service tests should cover normalization, uniqueness, and account state transitions.

## Migration Notes

Existing unverified code-login users may have no `hashedPassword`. They should not be allowed to password-login until they set a password through a future account recovery or password setup flow. That flow is out of scope.

The current UI can be updated after the API is stable:

- Registration page: explicit email, password, optional phone, optional username, then email code.
- Sign-in page: password login with email, phone, or username option, plus Google and Apple buttons.
