# Pacific Drone iOS Learning MVP Design

## Summary

Build a native iOS learning app for Pacific Drone using SwiftUI. The app shares the existing Next.js backend, Prisma database, lesson content, exam engine, progress tracking, and entitlement rules, but replaces the current WebView-first mobile experience with native screens for learning and mock exams.

The first version is a learning MVP for existing learners. It focuses on login, dashboard, lesson reading, progress, mock exams, and review. Registration, purchasing, advanced account management, and detailed Flight Review booking can remain on the website or open as web fallbacks.

## Goals

- Let an existing learner sign in with email and password.
- Open directly to a learning dashboard, not a marketing homepage.
- Show Basic and Advanced course progress and the next lesson to continue.
- Let learners browse courses, modules, lessons, and checkpoints.
- Let learners create, answer, submit, and review mock exams.
- Preserve current backend access rules, especially Advanced entitlement checks.
- Keep the first version small enough to build and verify without creating a second business system.

## Non-Goals

- Native registration and email verification.
- Native OAuth sign-in.
- Native purchase or in-app purchase.
- Offline lesson storage.
- Push notifications.
- Android native implementation.
- Replacing the existing web app, admin, marketing pages, payments, or desktop learning experience.

## Architecture

The current `mobile/ios` project is a Capacitor shell. For this MVP, iOS becomes a SwiftUI app that calls formal JSON APIs. The Capacitor shell can remain temporarily for rollback or comparison, but it is no longer the primary app UI.

Backend business logic stays in the existing Next.js app. The mobile app should not read page HTML, depend on React component structure, or copy grading/progress rules into Swift. It should call mobile-specific JSON endpoints that delegate to the same TypeScript services used by the web app.

The main boundaries are:

- iOS client: SwiftUI screens, navigation, local view models, API client, Keychain session storage.
- Mobile API layer: `/api/mobile/*` route handlers that expose stable JSON contracts.
- Existing services: auth/account, lessons, progress, checkpoints, exam engine, entitlements, and flight review status.
- Web app: marketing, desktop learning, admin CMS, payments, registration, account recovery, and first-version web fallbacks.

## iOS App Structure

The iOS app uses four bottom tabs:

- Home
- Learn
- Exam
- Account

Home is the launch tab. Lesson reader and active exam screens may hide the tab bar to keep reading and answering focused.

### Home

Home is a dashboard-first screen. It shows:

- Greeting and account entitlement.
- Continue Learning card with course, next lesson, progress ring, and primary continue button.
- Basic and Advanced course progress cards.
- Mock Exam shortcut.
- Flight Review status summary.

The visual structure follows the approved "Dashboard Home" concept: one clear continue action, compact progress summaries, and large tap targets.

### Learn

Learn shows Basic and Advanced course sections. A course opens into modules; a module opens into lessons.

The native lesson reader supports the content blocks needed by the current course material:

- Title and metadata.
- Paragraphs and headings.
- Ordered and unordered lists.
- Callouts.
- Images and videos.
- Checkpoint questions.
- Complete lesson action.
- Previous or next lesson navigation.

The MVP should not attempt to implement a full MDX runtime in Swift. Instead, the backend should return a structured lesson representation tailored to the app. If a lesson uses content outside the supported subset, the API should either omit unsupported decoration safely or return a web fallback flag for that lesson.

### Exam

Exam supports Basic and Advanced mock exams:

- Certification level selection.
- Create exam session.
- Fetch questions.
- Answer questions.
- Timer display.
- Question navigation.
- Submit exam.
- Score summary.
- Incorrect answer review.

The client never receives correct answers before submission. Grading remains server-side.

### Account

Account shows:

- Email and display name.
- Access tier.
- Progress summary.
- Links to website flows for purchase, registration, password management, or detailed Flight Review booking.
- Sign out.

## Mobile API Design

Add a mobile API layer instead of making Swift call page-specific endpoints directly.

### Auth

`POST /api/mobile/auth/login`

Input:

```json
{
  "email": "learner@example.com",
  "password": "password"
}
```

Output:

```json
{
  "token": "opaque-mobile-session-token",
  "expiresAt": "2026-07-24T00:00:00.000Z",
  "user": {
    "id": "user-id",
    "email": "learner@example.com",
    "name": "Learner",
    "accessTier": "FREE"
  }
}
```

The token is opaque to the client and stored in iOS Keychain. It must be revocable and expire. The backend should authenticate `/api/mobile/*` requests by this token, not by browser cookies or test-only headers.

`POST /api/mobile/auth/logout`

Revokes the current mobile token.

`GET /api/mobile/me`

Restores the current session and returns user profile, access tier, and a small progress summary.

### Dashboard

`GET /api/mobile/dashboard?locale=en`

Returns the data needed for Home in one request:

- User summary.
- Overall progress.
- Basic and Advanced progress.
- Resume lesson.
- Mock exam summary.
- Flight Review status.

This avoids a cold app launch making many independent requests.

### Courses And Lessons

`GET /api/mobile/courses?locale=en`

Returns course cards, module list, lesson counts, lock state, and completed lesson ids or percentages.

`GET /api/mobile/lessons/:lessonId?locale=en`

Returns a structured lesson document:

- Lesson id, title, course, module, duration if available.
- Content blocks.
- Checkpoint ids.
- Previous and next lesson ids.
- Completion state.
- Optional `webFallbackUrl` if the lesson cannot be represented natively.

`POST /api/mobile/progress/lesson`

Marks a lesson complete. It should delegate to existing lesson progress validation and reject unknown lesson ids.

### Checkpoints

`GET /api/mobile/checkpoint/:id?locale=en`

Returns a public checkpoint question without correct answers.

`POST /api/mobile/checkpoint/check`

Checks a checkpoint answer and returns correctness plus explanation. It should reuse the existing checkpoint checking logic.

### Exams

The mobile contract should mirror the existing exam lifecycle while accepting mobile token auth:

- `POST /api/mobile/exam`
- `GET /api/mobile/exam/:id/questions`
- `POST /api/mobile/exam/:id/answer`
- `POST /api/mobile/exam/:id/submit`
- `GET /api/mobile/exam/:id/review`

Advanced mock exam creation must continue to require paid access. Anonymous Basic taster behavior is not part of the iOS MVP because this app is for signed-in learners.

## Security

- Store mobile session tokens only in Keychain.
- Do not use browser cookies as the native auth mechanism.
- Do not use `x-test-user-id` or other test-only headers.
- Keep all entitlement checks server-side.
- Keep exam grading server-side.
- Never send correct answers before exam submission.
- Rate-limit login and public checkpoint-style endpoints.
- On token expiry or revocation, clear local session state and return to login.

## Error Handling

- Not signed in: show login.
- Token expired: clear Keychain and show login.
- Network failure: show retry affordance and preserve local screen state where reasonable.
- Advanced locked: show locked state and link to the website upgrade flow.
- Lesson not representable natively: open web fallback for that lesson.
- Exam answer failure: keep local selection and let the learner retry.
- Exam submit failure: keep answers locally until retry or exit confirmation.

## Testing

Backend tests:

- Mobile login success and failure.
- Mobile token expiry and revocation.
- `/api/mobile/me` auth.
- Dashboard aggregation for free and paid users.
- Course and lesson JSON contracts.
- Lesson completion validation.
- Checkpoint fetch and check.
- Exam create, question fetch, answer, submit, and review.
- Advanced access denial for free users.

iOS tests:

- API client request/response decoding.
- Auth view model token persistence and sign-out.
- Dashboard view model loading and error states.
- Course and lesson view model navigation.
- Exam view model answer, timer, submit, and review transitions.

Manual verification:

- Sign in with existing learner.
- Land on Home and continue the next lesson.
- Complete a lesson and see progress update.
- Create a Basic mock exam.
- Answer, submit, and review incorrect answers.
- Sign out and confirm relaunch returns to login.

Build verification:

- `pnpm typecheck`
- `pnpm test`
- iOS simulator build with `xcodebuild`

## Implementation Notes

The first implementation plan should start with the mobile API contract and auth model before building screens. SwiftUI screens can use stubbed fixtures briefly, but they should switch to real `/api/mobile/*` endpoints before the MVP is considered complete.

The existing WebView app should remain runnable until the SwiftUI MVP can complete the main learning flow. This gives a fallback during development without expanding MVP scope.
