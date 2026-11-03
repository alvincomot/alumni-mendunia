-- Review and apply after 20261026000100. This migration does not change Auth users.
BEGIN;

CREATE TABLE app_private.school_password_reissues (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  request_id uuid NOT NULL UNIQUE,
  actor_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE app_private.school_password_reissues IS
  'Short-lived server workflow locks. Contains no plaintext credentials.';

REVOKE ALL ON TABLE app_private.school_password_reissues
  FROM PUBLIC, anon, authenticated, service_role;

-- Preserve every guard installed by 20261026000100. The added branch permits
-- only false-to-true changes that have a matching private workflow lock.
CREATE OR REPLACE FUNCTION app_private.guard_profile_administration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_reissue_request text;
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

  IF pg_catalog.current_setting('app.school_password_reissue', true) = 'verified' THEN
    v_reissue_request := NULLIF(
      pg_catalog.current_setting('app.school_password_reissue_request_id', true),
      ''
    );
    IF app_private.is_admin() IS DISTINCT FROM TRUE
      OR TG_OP <> 'UPDATE'
      OR v_reissue_request IS NULL
      OR OLD.user_id IS DISTINCT FROM NEW.user_id
      OR OLD.full_name IS DISTINCT FROM NEW.full_name
      OR OLD.role IS DISTINCT FROM NEW.role
      OR OLD.school_id IS DISTINCT FROM NEW.school_id
      OR OLD.is_active IS DISTINCT FROM NEW.is_active
      OR OLD.created_at IS DISTINCT FROM NEW.created_at
      OR OLD.must_change_password IS DISTINCT FROM false
      OR NEW.must_change_password IS DISTINCT FROM true
      OR NOT EXISTS (
        SELECT 1
        FROM app_private.school_password_reissues workflow
        WHERE workflow.user_id = NEW.user_id
          AND workflow.request_id = v_reissue_request::uuid
          AND workflow.actor_id = auth.uid()
      ) THEN
      RAISE EXCEPTION 'Invalid school password reissue operation' USING ERRCODE = '42501';
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

CREATE FUNCTION app_private.begin_school_password_reissue(
  p_school_id uuid,
  p_request_id uuid
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_target_id uuid;
  v_requires_change boolean;
BEGIN
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

  SELECT user_id, must_change_password
  INTO v_target_id, v_requires_change
  FROM public.profiles
  WHERE school_id = p_school_id
    AND role = 'petugas_sekolah'
    AND is_active = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active School Staff account is required' USING ERRCODE = '23514';
  END IF;

  DELETE FROM app_private.school_password_reissues
  WHERE user_id = v_target_id
    AND started_at < pg_catalog.now() - interval '15 minutes';

  BEGIN
    INSERT INTO app_private.school_password_reissues(user_id, request_id, actor_id)
    VALUES (v_target_id, p_request_id, auth.uid());
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'A password reissue is already in progress'
      USING ERRCODE = '55P03';
  END;

  IF v_requires_change = false THEN
    PERFORM pg_catalog.set_config('app.school_password_reissue', 'verified', true);
    PERFORM pg_catalog.set_config(
      'app.school_password_reissue_request_id',
      p_request_id::text,
      true
    );
    UPDATE public.profiles
    SET must_change_password = true
    WHERE user_id = v_target_id AND must_change_password = false;
  ELSE
    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id)
    VALUES (auth.uid(), 'UPDATE', 'profiles', v_target_id);
  END IF;

  RETURN v_target_id;
END;
$$;

CREATE FUNCTION public.begin_school_password_reissue(
  p_school_id uuid,
  p_request_id uuid
)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT app_private.begin_school_password_reissue(p_school_id, p_request_id);
$$;

CREATE FUNCTION app_private.finish_school_password_reissue(p_request_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_deleted uuid;
BEGIN
  IF app_private.is_admin() IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Active administrator required' USING ERRCODE = '42501';
  END IF;

  DELETE FROM app_private.school_password_reissues
  WHERE request_id = p_request_id AND actor_id = auth.uid()
  RETURNING user_id INTO v_deleted;

  RETURN v_deleted IS NOT NULL;
END;
$$;

CREATE FUNCTION public.finish_school_password_reissue(p_request_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT app_private.finish_school_password_reissue(p_request_id);
$$;

CREATE FUNCTION public.school_password_reissue_ready()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app_private.is_admin() IS NOT DISTINCT FROM TRUE;
$$;

REVOKE ALL ON FUNCTION app_private.guard_profile_administration()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.begin_school_password_reissue(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.finish_school_password_reissue(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.begin_school_password_reissue(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finish_school_password_reissue(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.school_password_reissue_ready()
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.begin_school_password_reissue(uuid,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_school_password_reissue(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.school_password_reissue_ready()
  TO authenticated;

COMMIT;
