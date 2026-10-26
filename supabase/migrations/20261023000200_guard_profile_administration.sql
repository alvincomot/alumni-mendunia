-- Adds integrity checks without replacing existing RLS or audit triggers.
BEGIN;
CREATE FUNCTION app_private.guard_profile_administration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    -- Serialize role changes, including two administrators changing one another.
    PERFORM pg_catalog.pg_advisory_xact_lock(20261023, 2);
    IF NOT app_private.is_admin() THEN
      RAISE EXCEPTION 'Active administrator required' USING ERRCODE = '42501';
    END IF;
    IF NEW.user_id = auth.uid() AND (NEW.role <> 'admin_dinas' OR NOT NEW.is_active) THEN
      RAISE EXCEPTION 'Cannot remove own administrative access' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.role = 'petugas_sekolah' THEN
    PERFORM 1 FROM public.schools WHERE id = NEW.school_id AND is_active = true FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'An active school is required' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.guard_profile_administration() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER profiles_administration_guard BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_profile_administration();
COMMIT;
