// Native register → same handler as web (rate limiting, account creation,
// verification-code email). Client then posts the code to ../verify-email.
export { POST } from "../../../auth/register/route";
