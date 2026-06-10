-- Auto-enable Row Level Security (RLS) on every public table, reproducibly.
--
-- Captured from the original Supabase project so this hardening exists in any
-- environment (fresh DB / staging / rebuild), not just the one where it was set
-- up by hand. The app connects via Prisma as the table-owner role, which BYPASSES
-- RLS, so the application is unaffected. RLS-on with no policies denies Supabase's
-- anon / authenticated PostgREST roles by default (deny-by-default).
--
-- NOTE: on the original project these objects already exist; this migration is
-- recorded as applied there via `prisma migrate resolve --applied` and only runs
-- for real on fresh environments. All statements are idempotent regardless.

-- 1. Function: enable RLS on each newly created public table.
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

-- 3. Backfill: enable RLS on tables that already existed before the trigger.
--    On a fresh replay the init migration creates these before this runs, so the
--    trigger does not catch them; enable explicitly. Idempotent.
ALTER TABLE IF EXISTS "Entitlement"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "ExamSession"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "Lesson"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "LessonProgress"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "Payment"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "Question"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "QuestionOption"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "User"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "UserIdentity"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "VerificationCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "WebhookEvent"     ENABLE ROW LEVEL SECURITY;
