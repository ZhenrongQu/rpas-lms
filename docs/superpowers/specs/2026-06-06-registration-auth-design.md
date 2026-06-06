# Registration and Authentication Design

Date: 2026-06-06
Project: `/Users/quzhenrong/rpas-lms`
Status: Approved design, not yet implemented

## Goal

Design the user registration and login behavior for RPAS LMS so learners can register for free, access free teaching content, and later upgrade to paid access for the full question bank.

The desired product behavior is similar to ChatGPT-style login: users can continue with Google or Apple, or register manually with email, phone, or a chosen username.

## Non-Goals

- Do not implement payment or purchase checkout in this phase.
- Do not decide the final email/SMS provider in this design.
- Do not build password reset flows unless a password-based login mode is explicitly added later.
- Do not migrate the whole course/content system in this phase.

## Registration Options

The registration screen should offer:

- Continue with Google
- Continue with Apple
- Email registration
- Phone registration
- Username registration

All successful registrations create a `FREE` user by default.

## Verification Rules

### Google

Google OAuth can create or log in a user when the OAuth provider returns a verified email.

Behavior:

- If the Google identity already exists, log in the linked user.
- If the email belongs to an existing user, link Google to that user after provider verification.
- Otherwise create a new user with `accessTier = "FREE"`.

### Apple

Apple OAuth follows the same shape as Google.

Behavior:

- If the Apple identity already exists, log in the linked user.
- If Apple provides a verified email matching an existing user, link the Apple identity.
- Otherwise create a new user with `accessTier = "FREE"`.

Apple private relay emails should be treated as valid verified emails, but the app should not assume they are permanent contact emails for future marketing or support.

### Email

Email registration uses a 6-digit verification code.

Flow:

1. User enters an email address.
2. Server validates the email format.
3. Server creates a 6-digit code.
4. Server stores only a hash of the code.
5. Server sends the code by email.
6. User enters the code.
7. Server verifies the code, consumes it, and creates or logs in the user.
8. New users receive `accessTier = "FREE"`.

### Phone

Phone registration mirrors email registration.

Flow:

1. User enters a phone number.
2. Server normalizes the phone number, ideally to E.164 format.
3. Server creates a 6-digit code.
4. Server stores only a hash of the code.
5. Server sends the code by SMS.
6. User enters the code.
7. Server verifies the code, consumes it, and creates or logs in the user.
8. New users receive `accessTier = "FREE"`.

### Username

Username is allowed, but it is not a standalone proof of identity.

Flow:

1. User chooses a username.
2. Server checks that the username is available.
3. User must bind either email or phone.
4. Email or phone must be verified with a 6-digit code.
5. Server creates a user with:
   - `username`
   - verified `email` or verified `phone`
   - `accessTier = "FREE"`

Rationale: username-only registration makes account recovery, abuse prevention, and identity verification weaker. A username is useful as a login alias or display handle, but it should be backed by a verified contact method.

## Login Options

After registration, users should be able to log in with:

- Google
- Apple
- Email + 6-digit code
- Phone + 6-digit code
- Username + verification through the bound email or phone

Password login is not the recommended default for this phase. The current code has credentials/password support, but the target design moves toward verification-code login to reduce forgotten-password and weak-password handling.

## Data Model

The current `User` model is too small for multi-provider registration. The target model should separate the user from identity providers and verification codes.

Recommended Prisma model shape:

```prisma
model User {
  id              String   @id @default(cuid())
  username        String?  @unique
  email           String?  @unique
  phone           String?  @unique
  displayName     String?
  accessTier      String   @default("FREE")
  emailVerifiedAt DateTime?
  phoneVerifiedAt DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  identities      UserIdentity[]
  examSessions    ExamSession[]
}

model UserIdentity {
  id                String   @id @default(cuid())
  userId            String
  provider          String
  providerAccountId String
  verifiedAt        DateTime?
  createdAt         DateTime @default(now())

  user              User     @relation(fields: [userId], references: [id])

  @@unique([provider, providerAccountId])
}

model VerificationCode {
  id         String   @id @default(cuid())
  target     String
  channel    String
  codeHash   String
  expiresAt  DateTime
  consumedAt DateTime?
  createdAt  DateTime @default(now())
}
```

Provider values:

- `google`
- `apple`
- `email`
- `phone`
- `username`

Channel values:

- `email`
- `sms`

## Verification Code Rules

Verification codes should use these rules:

- 6 numeric digits.
- Expire after 10 minutes.
- Store only a hash, never the plain code.
- Consume after successful verification.
- Allow a small number of attempts, for example 5.
- Rate-limit by target and IP.
- Do not reveal whether an email or phone is already registered in public responses.

Example response style:

- For request-code success: `If this contact can receive codes, a code has been sent.`
- For verify failure: `Invalid or expired code.`

## Access Tiers

The product has three practical access levels:

- `GUEST`: not signed in.
- `FREE`: registered user, no purchase.
- `PAID`: purchased full access.

Current intended behavior:

- `GUEST`: can access intro/free marketing content only.
- `FREE`: can access free teaching content and free question subset.
- `PAID`: can access all teaching content and all questions.

Payment is out of scope for this design, but the model should preserve the `accessTier` field so a future checkout flow can upgrade a user to `PAID`.

## Question Access Rule

Free question access should be based on `difficulty`.

Recommended meaning:

- `difficulty: 0`: free question
- `difficulty: 1`: paid basic-level question
- `difficulty: 2`: paid medium question
- `difficulty: 3`: paid hard question

Access rule:

```ts
if (tier === "GUEST") return [];
if (tier === "FREE") return questions.filter((q) => q.difficulty === 0);
if (tier === "PAID") return questions;
```

This replaces module-based free filtering. It gives content authors a simple way to mark individual free questions without changing business logic.

## Teaching Content Access Rule

Content should eventually have an explicit access marker, for example:

```ts
access: "GUEST" | "FREE" | "PAID"
```

Initial behavior:

- Intro module: `GUEST`
- Selected Basic lessons: `FREE`
- Full Basic and Advanced lessons: `PAID`

If content metadata is not fully implemented yet, the code can use a small hardcoded access map as a transitional step.

## API Surface

Recommended endpoints:

```text
POST /api/auth/code/request
POST /api/auth/code/verify
POST /api/auth/register/username
GET  /api/auth/username/check?username=...
```

Possible payloads:

```json
{ "channel": "email", "target": "pilot@example.com" }
```

```json
{ "channel": "sms", "target": "+16045551234" }
```

```json
{
  "channel": "email",
  "target": "pilot@example.com",
  "code": "123456"
}
```

```json
{
  "username": "dronepilot",
  "channel": "email",
  "target": "pilot@example.com",
  "code": "123456"
}
```

## UI Behavior

Registration page:

- Show Google and Apple buttons first.
- Show tabs or segmented controls for Email, Phone, Username.
- Email and Phone flows show two steps:
  - Enter contact
  - Enter verification code
- Username flow shows:
  - Choose username
  - Choose email or phone verification
  - Enter code

Login page:

- Same Google and Apple options.
- Email and Phone code login.
- Username login resolves to the user's bound verified contact method, then sends a code.

## Error Handling

User-facing errors should be simple and not leak account existence:

- Invalid or expired code.
- Too many attempts. Try again later.
- Username is unavailable.
- Verification required.

Server-side logs can be more specific for debugging.

## Testing Plan

Core tests:

- Requesting an email code stores only a hash.
- Requesting a phone code stores only a hash.
- Expired codes are rejected.
- Consumed codes cannot be reused.
- Too many failed attempts are rejected.
- Verified email registration creates a `FREE` user.
- Verified phone registration creates a `FREE` user.
- Username registration requires verified email or phone.
- Duplicate provider identities link to the same user.
- `FREE` question access returns only `difficulty === 0`.
- `PAID` question access returns all questions.
- `GUEST` question access returns no questions.

## Open Follow-Ups

- Choose email provider.
- Choose SMS provider.
- Decide whether to keep password login as a secondary option or fully migrate away from it.
- Add purchase flow that upgrades `accessTier` from `FREE` to `PAID`.
