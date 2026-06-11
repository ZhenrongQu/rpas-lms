// Single source of truth for the (intentionally non-obvious) admin route slug.
// To rename: change ADMIN_SLUG and rename the two route folders:
//   app/<slug>  and  app/api/<slug>
// Plain strings only — safe to import from client components, middleware, and
// server components. Do not add server-only imports here.
export const ADMIN_SLUG = "coriander";
export const ADMIN_BASE = `/${ADMIN_SLUG}`;
export const ADMIN_API_BASE = `/api/${ADMIN_SLUG}`;
