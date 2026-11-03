-- Additive hardening for the already-applied native School activation flow.
-- Requires 20261028000200. This migration stores only a request-scoped
-- fingerprint of the Auth password hash, never the password or Auth hash.
BEGIN;

ALTER TABLE app_private.school_auth_accounts
  ADD COLUMN activation_password_fingerprint text
    CHECK (activation_password_fingerprint IS NULL
      OR activation_password_fingerprint ~ '^[a-f0-9]{32}$');

COMMENT ON COLUMN app_private.school_auth_accounts.activation_password_fingerprint IS
  'Request-scoped fingerprint used to prove the Auth password changed after activation binding.';

-- Preserve invitations that were already bound before this hardening deploys.
-- Their next successful password update must differ from this baseline.
UPDATE app_private.school_auth_accounts a
SET activation_password_fingerprint = pg_catalog.md5(
  coalesce(u.encrypted_password, '') || ':' || a.activation_request_id::text
)
FROM auth.users u
WHERE a.status = 'PENDING_ACTIVATION'
  AND a.activation_request_id IS NOT NULL
  AND a.user_id = u.id
  AND a.activation_password_fingerprint IS NULL;

CREATE OR REPLACE FUNCTION public.school_activation_bind(
  p_request_id uuid,
  p_operation_id uuid,
  p_user_id uuid
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_account app_private.school_auth_accounts;
  v_password_fingerprint text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Server role required' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(20261023,2);
  SELECT * INTO v_account FROM app_private.school_auth_accounts
    WHERE activation_request_id=p_request_id
      AND operation_id=p_operation_id
      AND activation_operation_ttl_seconds IS NOT NULL
      AND ((activation_operation_is_new AND status='UNCLAIMED')
        OR (NOT activation_operation_is_new AND status='PENDING_ACTIVATION'))
    FOR UPDATE;
  IF NOT FOUND AND EXISTS (
    SELECT 1 FROM app_private.school_auth_accounts
    WHERE activation_request_id=p_request_id AND status='PENDING_ACTIVATION'
      AND operation_id IS NULL AND user_id=p_user_id
      AND activation_expires_at>now() AND last_sent_at IS NOT NULL
      AND activation_password_fingerprint IS NOT NULL
  ) THEN
    RETURN true;
  END IF;
  IF NOT FOUND OR (v_account.user_id IS NOT NULL AND v_account.user_id<>p_user_id)
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=p_user_id
      AND (p.role<>'petugas_sekolah' OR p.school_id IS DISTINCT FROM v_account.school_id OR NOT p.is_active)) THEN
    RAISE EXCEPTION 'Activation identity mismatch' USING ERRCODE='42501';
  END IF;
  SELECT pg_catalog.md5(
    coalesce(u.encrypted_password, '') || ':' || p_request_id::text
  )
  INTO v_password_fingerprint
  FROM auth.users u
  WHERE u.id=p_user_id AND lower(u.email)=v_account.email;
  IF v_password_fingerprint IS NULL THEN
    RAISE EXCEPTION 'Activation identity mismatch' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.schools WHERE id=v_account.school_id AND is_active FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'School unavailable' USING ERRCODE='42501';
  END IF;
  UPDATE app_private.school_auth_accounts SET
    status='PENDING_ACTIVATION',user_id=p_user_id,
    activation_requested_at=now(),
    activation_expires_at=now()+make_interval(secs=>activation_operation_ttl_seconds),
    activation_password_fingerprint=v_password_fingerprint,
    last_sent_at=now(),
    operation_id=NULL,operation_started_at=NULL,
    activation_operation_is_new=false,activation_operation_ttl_seconds=NULL,
    updated_at=now()
    WHERE school_id=v_account.school_id;
  INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id)
    VALUES(NULL,'UPDATE','schools',v_account.school_id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.school_activation_cancel(
  p_request_id uuid,
  p_operation_id uuid
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_account app_private.school_auth_accounts;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Server role required' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(20261023,2);
  SELECT * INTO v_account FROM app_private.school_auth_accounts
    WHERE activation_request_id=p_request_id AND operation_id=p_operation_id
    FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE app_private.school_auth_accounts SET
    status=CASE WHEN v_account.activation_operation_is_new THEN 'UNCLAIMED' ELSE status END,
    email=CASE WHEN v_account.activation_operation_is_new THEN NULL ELSE email END,
    user_id=CASE WHEN v_account.activation_operation_is_new THEN NULL ELSE user_id END,
    activation_request_id=CASE WHEN v_account.activation_operation_is_new THEN NULL ELSE activation_request_id END,
    activation_requested_at=CASE WHEN v_account.activation_operation_is_new THEN NULL ELSE activation_requested_at END,
    activation_expires_at=CASE WHEN v_account.activation_operation_is_new THEN NULL ELSE activation_expires_at END,
    activation_password_fingerprint=CASE
      WHEN v_account.activation_operation_is_new THEN NULL
      ELSE activation_password_fingerprint END,
    operation_id=NULL,operation_started_at=NULL,
    activation_operation_is_new=false,activation_operation_ttl_seconds=NULL,
    updated_at=now()
    WHERE school_id=v_account.school_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_school_activation(
  p_user_id uuid,
  p_request_id uuid
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_account app_private.school_auth_accounts;
  v_profile public.profiles;
  v_current_password_fingerprint text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Server role required' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(20261023,2);
  SELECT * INTO v_account FROM app_private.school_auth_accounts
    WHERE activation_request_id=p_request_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR v_account.status NOT IN ('PENDING_ACTIVATION','ACTIVE')
    OR (v_account.status='PENDING_ACTIVATION' AND
      (v_account.activation_expires_at IS NULL OR v_account.activation_expires_at<=now())) THEN
    RAISE EXCEPTION 'Activation unavailable' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.schools WHERE id=v_account.school_id AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School unavailable' USING ERRCODE='42501'; END IF;
  SELECT pg_catalog.md5(
    coalesce(u.encrypted_password, '') || ':' || p_request_id::text
  )
  INTO v_current_password_fingerprint
  FROM auth.users u
  WHERE u.id=p_user_id AND lower(u.email)=v_account.email
    AND u.email_confirmed_at IS NOT NULL
    AND coalesce(u.encrypted_password,'')<>'';
  IF v_current_password_fingerprint IS NULL THEN
    RAISE EXCEPTION 'Verified email and Auth password required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE user_id=p_user_id FOR UPDATE;
  IF FOUND AND (v_profile.role<>'petugas_sekolah' OR v_profile.school_id IS DISTINCT FROM v_account.school_id
      OR NOT v_profile.is_active) THEN
    RAISE EXCEPTION 'Account assignment mismatch' USING ERRCODE='42501';
  END IF;
  IF v_account.status='ACTIVE' THEN
    IF v_profile.user_id IS NULL THEN
      RAISE EXCEPTION 'Account assignment mismatch' USING ERRCODE='42501';
    END IF;
    RETURN true;
  END IF;
  IF v_account.activation_password_fingerprint IS NULL
    OR v_current_password_fingerprint IS NOT DISTINCT FROM v_account.activation_password_fingerprint THEN
    RAISE EXCEPTION 'Password update for this activation is required' USING ERRCODE='42501';
  END IF;
  PERFORM set_config('app.school_auth_internal','verified',true);
  PERFORM set_config('app.password_change_actor_id',p_user_id::text,true);
  IF v_profile.user_id IS NULL THEN
    INSERT INTO public.profiles(user_id,full_name,role,school_id,is_active)
      SELECT p_user_id,left('Petugas '||name,150),'petugas_sekolah',id,true
      FROM public.schools WHERE id=v_account.school_id;
  ELSIF v_profile.must_change_password THEN
    PERFORM public.complete_initial_password_change(p_user_id);
  END IF;
  UPDATE app_private.school_auth_accounts SET status='ACTIVE',resume_status=NULL,
    email_verified_at=coalesce(email_verified_at,now()),activated_at=coalesce(activated_at,now()),
    activation_password_fingerprint=NULL,
    operation_id=NULL,operation_started_at=NULL,
    activation_operation_is_new=false,activation_operation_ttl_seconds=NULL,
    updated_at=now()
    WHERE school_id=v_account.school_id;
  INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id)
    VALUES(p_user_id,'UPDATE','schools',v_account.school_id);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.school_activation_bind(uuid,uuid,uuid),
  public.school_activation_cancel(uuid,uuid),
  public.complete_school_activation(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.school_activation_bind(uuid,uuid,uuid),
  public.school_activation_cancel(uuid,uuid),
  public.complete_school_activation(uuid,uuid)
  TO service_role;

COMMIT;
