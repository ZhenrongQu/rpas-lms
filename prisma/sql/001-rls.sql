-- Row Level Security hardening. Re-applied by `pnpm db:indexes` after every push.
--
-- Deny-by-default for Supabase's PostgREST roles (anon / authenticated): RLS on
-- with no policies denies them everything. The app connects via Prisma as the
-- table-owner role, which BYPASSES RLS, so the application is unaffected.
--
-- This is a MOVED copy of prisma/migrations/20260610231614_enable_rls_automation,
-- which nothing ever executes — this project syncs schema with `prisma db push`,
-- not `prisma migrate`. Left where it was, the hardening below existed only in a
-- directory no deploy reads, so every fresh environment (staging, a rebuild, a
-- new Supabase project) came up with RLS off on every table and no symptom.
--
-- Two facts make re-application mandatory rather than one-time:
--   * `db push --force-reset` drops schema public, which cascades away both the
--     function and the event trigger below (verified, not assumed).
--   * `db push` creates every table BEFORE this file runs, so the event trigger
--     never sees those CREATE TABLEs. The backfill is what actually covers them.
--
-- The backfill is a query over pg_class, not a hand-written table list. The
-- original migration listed 16 tables by name; the schema has since grown to 30,
-- and the 14 newer ones (FlightReviewCredit, RefundRequest, MobileSession,
-- RateLimit, ...) were silently left unprotected. A list that must be edited by
-- hand whenever a model is added is a guarantee that expires without warning.
--
-- Every statement is idempotent: this runs on every deploy.

-- 1. Enable RLS on each newly created public table, from now on.
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
    IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
    ELSE
      RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
    END IF;
  END LOOP;
END;
$function$;

-- 2. Event trigger: run the function after CREATE TABLE / CREATE TABLE AS / SELECT INTO.
DROP EVENT TRIGGER IF EXISTS ensure_rls;

CREATE EVENT TRIGGER ensure_rls
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION public.rls_auto_enable();

-- 3. Backfill every table the trigger did not catch — which, under `db push`,
--    is all of them. Derived from the catalog so it can never fall behind the
--    schema. `verifySchemaInvariants()` asserts this left nothing uncovered.
DO $backfill$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.oid::regclass AS ident
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t.ident);
    RAISE LOG 'rls backfill: enabled RLS on %', t.ident;
  END LOOP;
END;
$backfill$;
