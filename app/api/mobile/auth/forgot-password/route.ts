// Native clients hit the mobile-namespaced path; behaviour (rate limiting,
// anti-enumeration, reset-link email) is identical to the web endpoint.
export { POST } from "../../../auth/password/forgot/route";
