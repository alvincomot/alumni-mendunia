-- Separate School recovery delivery state from activation delivery state.
-- This migration is forward-only and must be reviewed before hosted application.
BEGIN;

ALTER TABLE app_private.school_auth_accounts
  ADD COLUMN recovery_last_sent_at timestamptz,
  ADD COLUMN recovery_operation_id uuid,
  ADD COLUMN recovery_operation_started_at timestamptz,
  ADD COLUMN recovery_last_operation_id uuid,
  ADD CONSTRAINT school_auth_recovery_operation_fields_check CHECK (
    (recovery_operation_id IS NULL) =
    (recovery_operation_started_at IS NULL)
  ),
  ADD CONSTRAINT school_auth_recovery_operation_id_key
    UNIQUE (recovery_operation_id),
  ADD CONSTRAINT school_auth_recovery_last_operation_id_key
    UNIQUE (recovery_last_operation_id);

CREATE OR REPLACE FUNCTION public.school_recovery_status(p_npsn text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account app_private.school_auth_accounts;
  v_retry_after integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Server role required' USING ERRCODE = '42501';
  END IF;

  IF p_npsn !~ '^\d{8}$' THEN
    RETURN NULL;
  END IF;

  SELECT a.*
    INTO v_account
    FROM app_private.school_auth_accounts a
    JOIN public.schools s ON s.id = a.school_id
    JOIN public.profiles p
      ON p.user_id = a.user_id
     AND p.school_id = s.id
   WHERE s.npsn = p_npsn
     AND s.is_active
     AND a.status = 'ACTIVE'
     AND p.is_active
     AND p.role = 'petugas_sekolah';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_retry_after := greatest(
    0,
    coalesce(
      ceil(extract(epoch FROM
        v_account.recovery_last_sent_at + interval '60 seconds' - now()
      ))::integer,
      0
    ),
    CASE
      WHEN v_account.recovery_operation_id IS NOT NULL
       AND v_account.recovery_operation_started_at > now() - interval '5 minutes'
      THEN greatest(
        1,
        ceil(extract(epoch FROM
          v_account.recovery_operation_started_at + interval '5 minutes' - now()
        ))::integer
      )
      ELSE 0
    END
  );

  RETURN jsonb_build_object('retry_after', v_retry_after);
END;
$$;

CREATE OR REPLACE FUNCTION public.school_recovery_request(p_npsn text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account app_private.school_auth_accounts;
  v_email text;
  v_operation_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Server role required' USING ERRCODE = '42501';
  END IF;

  IF p_npsn !~ '^\d{8}$' THEN
    RETURN NULL;
  END IF;

  SELECT a.*
    INTO v_account
    FROM app_private.school_auth_accounts a
    JOIN public.schools s ON s.id = a.school_id
    JOIN public.profiles p
      ON p.user_id = a.user_id
     AND p.school_id = s.id
   WHERE s.npsn = p_npsn
     AND s.is_active
     AND a.status = 'ACTIVE'
     AND p.is_active
     AND p.role = 'petugas_sekolah'
   FOR UPDATE OF a;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_account.recovery_operation_id IS NOT NULL
   AND v_account.recovery_operation_started_at <= now() - interval '5 minutes' THEN
    UPDATE app_private.school_auth_accounts
       SET recovery_operation_id = NULL,
           recovery_operation_started_at = NULL,
           updated_at = now()
     WHERE school_id = v_account.school_id;
    v_account.recovery_operation_id := NULL;
    v_account.recovery_operation_started_at := NULL;
  END IF;

  IF v_account.recovery_operation_id IS NOT NULL
    OR v_account.recovery_last_sent_at > now() - interval '60 seconds' THEN
    RAISE EXCEPTION 'Please wait before requesting password recovery'
      USING ERRCODE = '55P03';
  END IF;

  SELECT lower(email)
    INTO v_email
    FROM auth.users
   WHERE id = v_account.user_id
     AND lower(email) = v_account.email
     AND email_confirmed_at IS NOT NULL;

  IF v_email IS NULL THEN
    RETURN NULL;
  END IF;

  v_operation_id := gen_random_uuid();
  UPDATE app_private.school_auth_accounts
     SET recovery_operation_id = v_operation_id,
         recovery_operation_started_at = now(),
         updated_at = now()
   WHERE school_id = v_account.school_id;

  RETURN jsonb_build_object(
    'email', v_email,
    'operation_id', v_operation_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.school_recovery_bind(
  p_npsn text,
  p_operation_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account app_private.school_auth_accounts;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Server role required' USING ERRCODE = '42501';
  END IF;

  SELECT a.*
    INTO v_account
    FROM app_private.school_auth_accounts a
    JOIN public.schools s ON s.id = a.school_id
   WHERE s.npsn = p_npsn
   FOR UPDATE OF a;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_account.recovery_last_operation_id = p_operation_id
   AND v_account.recovery_last_sent_at IS NOT NULL THEN
    RETURN true;
  END IF;

  IF v_account.recovery_operation_id IS DISTINCT FROM p_operation_id THEN
    RETURN false;
  END IF;

  UPDATE app_private.school_auth_accounts
     SET recovery_last_sent_at = now(),
         recovery_last_operation_id = p_operation_id,
         recovery_operation_id = NULL,
         recovery_operation_started_at = NULL,
         updated_at = now()
   WHERE school_id = v_account.school_id;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id)
  VALUES (NULL, 'UPDATE', 'schools', v_account.school_id);

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.school_recovery_cancel(
  p_npsn text,
  p_operation_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Server role required' USING ERRCODE = '42501';
  END IF;

  SELECT a.school_id
    INTO v_school_id
    FROM app_private.school_auth_accounts a
    JOIN public.schools s ON s.id = a.school_id
   WHERE s.npsn = p_npsn
     AND a.recovery_operation_id = p_operation_id
   FOR UPDATE OF a;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE app_private.school_auth_accounts
     SET recovery_operation_id = NULL,
         recovery_operation_started_at = NULL,
         updated_at = now()
   WHERE school_id = v_school_id
     AND recovery_operation_id = p_operation_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION
  public.school_recovery_status(text),
  public.school_recovery_request(text),
  public.school_recovery_bind(text, uuid),
  public.school_recovery_cancel(text, uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.school_recovery_status(text),
  public.school_recovery_request(text),
  public.school_recovery_bind(text, uuid),
  public.school_recovery_cancel(text, uuid)
TO service_role;

COMMIT;
