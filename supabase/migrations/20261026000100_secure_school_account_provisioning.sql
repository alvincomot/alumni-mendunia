-- Review and apply separately. This migration does not alter existing Auth users.
BEGIN;

DO $preflight$
DECLARE
  v_duplicates text;
BEGIN
  SELECT pg_catalog.string_agg(
    duplicate.school_id::text || ' (' || duplicate.account_count::text || ' akun aktif)',
    ', ' ORDER BY duplicate.school_id::text
  )
  INTO v_duplicates
  FROM (
    SELECT school_id, count(*) AS account_count
    FROM public.profiles
    WHERE role = 'petugas_sekolah' AND is_active = true
    GROUP BY school_id
    HAVING count(*) > 1
  ) AS duplicate;

  IF v_duplicates IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate active School Staff profiles must be resolved before this migration can run'
      USING ERRCODE = '23505',
            DETAIL = 'school_id dan jumlah akun: ' || v_duplicates,
            HINT = 'Tinjau akun secara manual. Migration tidak menonaktifkan atau menghapus akun.';
  END IF;
END;
$preflight$;

ALTER TABLE public.profiles
  ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.must_change_password IS
  'Server-managed gate requiring a successful Auth password update before application access.';

CREATE UNIQUE INDEX profiles_one_active_school_staff_idx
  ON public.profiles(school_id)
  WHERE role = 'petugas_sekolah' AND is_active = true;

-- A password change is completed by a service-role database call after the
-- authenticated user has successfully changed the Auth password. Keep the
-- original JWT untouched; this transaction-local value is used only to
-- attribute the existing profile audit trigger to that verified user.
CREATE OR REPLACE FUNCTION app_private.record_audit_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_row jsonb;
  v_entity_id uuid;
  v_actor_id uuid := auth.uid();
  v_password_change_actor text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF pg_catalog.to_jsonb(OLD) = pg_catalog.to_jsonb(NEW) THEN
      RETURN NEW;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    v_row := pg_catalog.to_jsonb(OLD);
  ELSE
    v_row := pg_catalog.to_jsonb(NEW);
  END IF;
  v_entity_id := COALESCE(v_row->>'id', v_row->>'user_id')::uuid;

  IF v_actor_id IS NULL
    AND TG_TABLE_SCHEMA = 'public'
    AND TG_TABLE_NAME = 'profiles'
    AND auth.role() IS NOT DISTINCT FROM 'service_role' THEN
    v_password_change_actor := NULLIF(
      pg_catalog.current_setting('app.password_change_actor_id', true),
      ''
    );
    IF v_password_change_actor IS NOT NULL THEN
      v_actor_id := v_password_change_actor::uuid;
    END IF;
  END IF;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id)
  VALUES (v_actor_id, TG_OP, TG_TABLE_NAME, v_entity_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION app_private.provision_school_profile(
  p_user_id uuid,
  p_full_name text,
  p_school_id uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(20261023, 2);

  IF app_private.is_admin() IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Active administrator required' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.schools
  WHERE id = p_school_id AND is_active = true
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active school is required' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE school_id = p_school_id
      AND role = 'petugas_sekolah'
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'An active School Staff account already exists for this school'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.profiles(
    user_id,
    full_name,
    role,
    school_id,
    is_active,
    must_change_password
  )
  VALUES (
    p_user_id,
    p_full_name,
    'petugas_sekolah',
    p_school_id,
    true,
    true
  );
END;
$$;

CREATE FUNCTION public.provision_school_profile(
  p_user_id uuid,
  p_full_name text,
  p_school_id uuid
)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT app_private.provision_school_profile(p_user_id, p_full_name, p_school_id);
$$;

-- Preserve every existing administration guard. The only additional path is
-- a service-role update that can change must_change_password from true to
-- false without changing any other profile field.
CREATE OR REPLACE FUNCTION app_private.guard_profile_administration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF pg_catalog.current_setting('app.initial_password_change', true) = 'verified' THEN
    IF auth.role() IS DISTINCT FROM 'service_role'
      OR TG_OP <> 'UPDATE'
      OR OLD.user_id IS DISTINCT FROM NEW.user_id
      OR OLD.full_name IS DISTINCT FROM NEW.full_name
      OR OLD.role IS DISTINCT FROM NEW.role
      OR OLD.school_id IS DISTINCT FROM NEW.school_id
      OR OLD.is_active IS DISTINCT FROM NEW.is_active
      OR OLD.created_at IS DISTINCT FROM NEW.created_at
      OR OLD.must_change_password IS DISTINCT FROM true
      OR NEW.must_change_password IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'Invalid initial password change operation' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.must_change_password IS DISTINCT FROM NEW.must_change_password THEN
    RAISE EXCEPTION 'Initial password change flag is server-managed'
      USING ERRCODE = '42501';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(20261023, 2);
    IF app_private.is_admin() IS DISTINCT FROM TRUE THEN
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

CREATE FUNCTION public.complete_initial_password_change(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_changed uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Server administration role required' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.profiles
  WHERE user_id = p_user_id
    AND role = 'petugas_sekolah'
    AND school_id IS NOT NULL
    AND is_active = true
    AND must_change_password = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  PERFORM pg_catalog.set_config('app.initial_password_change', 'verified', true);
  PERFORM pg_catalog.set_config('app.password_change_actor_id', p_user_id::text, true);

  UPDATE public.profiles
  SET must_change_password = false
  WHERE user_id = p_user_id
    AND is_active = true
    AND must_change_password = true
  RETURNING user_id INTO v_changed;

  RETURN v_changed IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION app_private.provision_school_profile(uuid,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.record_audit_log()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.guard_profile_administration()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.provision_school_profile(uuid,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_initial_password_change(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.provision_school_profile(uuid,text,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_initial_password_change(uuid)
  TO service_role;

COMMIT;
