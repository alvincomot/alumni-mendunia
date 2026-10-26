-- Review before deployment. Existing RLS, audit triggers and migrations remain intact.
BEGIN;

CREATE FUNCTION app_private.lock_profile_administration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Take the existing administration lock before row locks to serialize writers.
  PERFORM pg_catalog.pg_advisory_xact_lock(20261023, 2);
  RETURN NULL;
END;
$$;

CREATE FUNCTION app_private.guard_last_active_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.role = 'admin_dinas' AND OLD.is_active THEN
    IF TG_OP = 'DELETE' OR NEW.role <> 'admin_dinas' OR NOT NEW.is_active THEN
      -- Lock alternatives too: stale repeatable-read transactions must fail,
      -- not count an administrator that another transaction already demoted.
      PERFORM user_id FROM public.profiles
        WHERE user_id <> OLD.user_id AND role = 'admin_dinas' AND is_active
        ORDER BY user_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'At least one active Admin Dinas is required'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.lock_profile_administration() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.guard_last_active_admin() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER profiles_administration_lock BEFORE INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH STATEMENT EXECUTE FUNCTION app_private.lock_profile_administration();
CREATE TRIGGER profiles_last_active_admin_guard BEFORE UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_last_active_admin();

COMMIT;
