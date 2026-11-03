-- Replaces the unapplied Admin-only cleanup proposal. Requires 20261028000100.
-- Supabase Auth owns email tokens. Existing users and lifecycle rows are retained.
BEGIN;

ALTER TABLE app_private.school_auth_accounts
  ADD COLUMN activation_request_id uuid UNIQUE,
  ADD COLUMN activation_requested_at timestamptz,
  ADD COLUMN activation_expires_at timestamptz,
  ADD COLUMN activation_operation_is_new boolean NOT NULL DEFAULT false,
  ADD COLUMN activation_operation_ttl_seconds integer
    CHECK (activation_operation_ttl_seconds IS NULL
      OR activation_operation_ttl_seconds BETWEEN 300 AND 86400);

-- Retire custom-token entry points, including the old claim-reset operation.
DROP FUNCTION public.school_auth_request(text,text,text,text);
DROP FUNCTION public.school_auth_validate(text,text);
DROP FUNCTION public.school_auth_begin(text,text,uuid);
DROP FUNCTION public.school_auth_complete(uuid,uuid);
DROP FUNCTION public.school_auth_abort(uuid);
DROP FUNCTION public.school_auth_legacy_complete(uuid);
DROP FUNCTION public.school_auth_admin_change(uuid,text);
COMMENT ON TABLE app_private.school_auth_tokens IS
  'Legacy hashed tokens retained for reconciliation only. Native Supabase Auth now verifies all email tokens.';

CREATE OR REPLACE FUNCTION public.school_auth_lookup(p_npsn text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Server role required' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object('name',s.name,'npsn',s.npsn,
    'status',CASE
      WHEN NOT s.is_active OR a.status='SUSPENDED' THEN 'SUSPENDED'
      WHEN a.status='ACTIVE' AND NOT EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.user_id=a.user_id
          AND p.school_id=s.id AND p.role='petugas_sekolah' AND p.is_active
      ) THEN 'SUSPENDED'
      WHEN a.activation_operation_is_new AND a.operation_id IS NOT NULL
        THEN 'UNCLAIMED'
      WHEN a.status='PENDING_ACTIVATION'
        AND coalesce(a.activation_expires_at,a.updated_at+interval '1 hour')<=now()
        AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.school_id=s.id)
        THEN 'UNCLAIMED'
      ELSE a.status END,
    'retry_after',greatest(
      0,
      coalesce(ceil(extract(epoch FROM a.last_sent_at+interval '60 seconds'-now())),0),
      CASE WHEN a.operation_id IS NOT NULL
        THEN coalesce(ceil(extract(epoch FROM a.operation_started_at+interval '5 minutes'-now())),0)
        ELSE 0 END))
  INTO v_result FROM public.schools s
    JOIN app_private.school_auth_accounts a ON a.school_id=s.id
    WHERE s.npsn=p_npsn;
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.school_activation_request(
  p_npsn text,
  p_email text DEFAULT NULL,
  p_token_ttl_seconds integer DEFAULT 3600
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_school public.schools; v_account app_private.school_auth_accounts;
  v_email text; v_user auth.users; v_new boolean; v_expired boolean;
  v_operation_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Server role required' USING ERRCODE='42501';
  END IF;
  IF p_npsn IS NULL OR p_npsn !~ '^[0-9]{8}$' THEN
    RAISE EXCEPTION 'Invalid school identity' USING ERRCODE='23514';
  END IF;
  IF p_token_ttl_seconds IS NULL OR p_token_ttl_seconds NOT BETWEEN 300 AND 86400 THEN
    RAISE EXCEPTION 'Invalid activation expiry' USING ERRCODE='23514';
  END IF;
  PERFORM pg_advisory_xact_lock(20261023,2);
  SELECT * INTO v_school FROM public.schools WHERE npsn=p_npsn AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_account FROM app_private.school_auth_accounts WHERE school_id=v_school.id FOR UPDATE;
  IF NOT FOUND OR v_account.status NOT IN ('UNCLAIMED','PENDING_ACTIVATION') THEN
    RAISE EXCEPTION 'Activation unavailable' USING ERRCODE='42501';
  END IF;
  IF v_account.operation_id IS NOT NULL
      AND v_account.operation_started_at>now()-interval '5 minutes' THEN
    RAISE EXCEPTION 'Activation request in progress' USING ERRCODE='55P03';
  ELSIF v_account.operation_id IS NOT NULL THEN
    UPDATE app_private.school_auth_accounts SET
      status=CASE WHEN activation_operation_is_new THEN 'UNCLAIMED' ELSE status END,
      email=CASE WHEN activation_operation_is_new THEN NULL ELSE email END,
      user_id=CASE WHEN activation_operation_is_new THEN NULL ELSE user_id END,
      activation_request_id=CASE WHEN activation_operation_is_new THEN NULL ELSE activation_request_id END,
      activation_requested_at=CASE WHEN activation_operation_is_new THEN NULL ELSE activation_requested_at END,
      activation_expires_at=CASE WHEN activation_operation_is_new THEN NULL ELSE activation_expires_at END,
      operation_id=NULL,operation_started_at=NULL,
      activation_operation_is_new=false,activation_operation_ttl_seconds=NULL,
      updated_at=now()
      WHERE school_id=v_school.id RETURNING * INTO v_account;
  END IF;
  IF v_account.last_sent_at > now()-interval '60 seconds' THEN
    RAISE EXCEPTION 'Please wait before resending' USING ERRCODE='55P03';
  END IF;
  v_expired := coalesce(v_account.activation_expires_at,v_account.updated_at+interval '1 hour')<=now();
  v_new := v_account.status='UNCLAIMED' OR (v_expired
    AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.school_id=v_school.id));
  IF v_new THEN
    v_email := lower(btrim(p_email));
    IF v_email IS NULL OR length(v_email) NOT BETWEEN 3 AND 254 OR v_email NOT LIKE '%@%' THEN
      RAISE EXCEPTION 'Email required' USING ERRCODE='23514';
    END IF;
  ELSE
    v_email := v_account.email;
    IF p_email IS NOT NULL AND lower(btrim(p_email)) IS DISTINCT FROM v_email THEN
      RAISE EXCEPTION 'Pending email cannot be changed' USING ERRCODE='42501';
    END IF;
  END IF;
  SELECT * INTO v_user FROM auth.users WHERE lower(email)=v_email;
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.school_id=v_school.id
      AND (p.user_id IS DISTINCT FROM v_user.id OR NOT p.is_active))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=v_user.id
      AND (p.role<>'petugas_sekolah' OR p.school_id IS DISTINCT FROM v_school.id OR NOT p.is_active))
    OR EXISTS (SELECT 1 FROM app_private.school_auth_accounts a WHERE a.school_id<>v_school.id
      AND (a.user_id=v_user.id OR a.email=v_email)) THEN
    RAISE EXCEPTION 'Account assignment unavailable' USING ERRCODE='42501';
  END IF;
  v_operation_id := gen_random_uuid();
  UPDATE app_private.school_auth_accounts SET
    status=CASE WHEN v_new THEN 'UNCLAIMED' ELSE 'PENDING_ACTIVATION' END,
    email=v_email, user_id=v_user.id,
    activation_request_id=CASE WHEN v_new OR v_expired THEN gen_random_uuid() ELSE coalesce(activation_request_id,gen_random_uuid()) END,
    activation_requested_at=CASE WHEN v_new OR v_expired THEN now() ELSE activation_requested_at END,
    activation_expires_at=CASE WHEN v_new OR v_expired THEN NULL ELSE activation_expires_at END,
    operation_id=v_operation_id,operation_started_at=now(),
    activation_operation_is_new=v_new,
    activation_operation_ttl_seconds=p_token_ttl_seconds,
    updated_at=now()
    WHERE school_id=v_school.id RETURNING * INTO v_account;
  RETURN jsonb_build_object('request_id',v_account.activation_request_id,
    'operation_id',v_operation_id,'email',v_email,'user_id',v_user.id,
    'confirmed',v_user.email_confirmed_at IS NOT NULL);
END;
$$;

CREATE FUNCTION public.school_activation_bind(
  p_request_id uuid,
  p_operation_id uuid,
  p_user_id uuid
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_account app_private.school_auth_accounts;
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
  ) THEN
    RETURN true;
  END IF;
  IF NOT FOUND OR (v_account.user_id IS NOT NULL AND v_account.user_id<>p_user_id)
    OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id=p_user_id AND lower(email)=v_account.email)
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=p_user_id
      AND (p.role<>'petugas_sekolah' OR p.school_id IS DISTINCT FROM v_account.school_id OR NOT p.is_active)) THEN
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

-- Keep the immediately preceding application release operational while the
-- database-first deployment is rolling out. The new application always sends
-- the operation ID; this service-only wrapper resolves it for the old caller.
CREATE FUNCTION public.school_activation_bind(
  p_request_id uuid,
  p_user_id uuid
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_operation_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Server role required' USING ERRCODE='42501';
  END IF;
  SELECT operation_id INTO v_operation_id
  FROM app_private.school_auth_accounts
  WHERE activation_request_id=p_request_id
    AND status IN ('UNCLAIMED','PENDING_ACTIVATION')
    AND operation_id IS NOT NULL;
  IF v_operation_id IS NULL THEN
    RAISE EXCEPTION 'Activation unavailable' USING ERRCODE='42501';
  END IF;
  RETURN public.school_activation_bind(
    p_request_id,
    v_operation_id,
    p_user_id
  );
END;
$$;

CREATE FUNCTION public.school_activation_cancel(
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
    operation_id=NULL,operation_started_at=NULL,
    activation_operation_is_new=false,activation_operation_ttl_seconds=NULL,
    updated_at=now()
    WHERE school_id=v_account.school_id;
  RETURN true;
END;
$$;

CREATE FUNCTION public.school_activation_context(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Server role required' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object('name',s.name,'npsn',s.npsn,'request_id',a.activation_request_id)
    INTO v_result FROM app_private.school_auth_accounts a
    JOIN public.schools s ON s.id=a.school_id JOIN auth.users u ON u.id=a.user_id
    WHERE a.user_id=p_user_id AND a.status='PENDING_ACTIVATION' AND s.is_active
      AND a.activation_request_id IS NOT NULL AND a.activation_expires_at>now()
      AND lower(u.email)=a.email AND u.email_confirmed_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=p_user_id
        AND (p.role<>'petugas_sekolah' OR p.school_id IS DISTINCT FROM s.id OR NOT p.is_active));
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.complete_school_activation(p_user_id uuid,p_request_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_account app_private.school_auth_accounts; v_profile public.profiles;
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
  PERFORM 1 FROM auth.users WHERE id=p_user_id AND lower(email)=v_account.email
    AND email_confirmed_at IS NOT NULL AND coalesce(encrypted_password,'')<>'';
  IF NOT FOUND THEN RAISE EXCEPTION 'Verified email and Auth password required' USING ERRCODE='42501'; END IF;
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
  PERFORM set_config('app.school_auth_internal','verified',true);
  PERFORM set_config('app.password_change_actor_id',p_user_id::text,true);
  IF v_profile.user_id IS NULL THEN
    INSERT INTO public.profiles(user_id,full_name,role,school_id,is_active)
      SELECT p_user_id,left('Petugas '||name,150),'petugas_sekolah',id,true
      FROM public.schools WHERE id=v_account.school_id;
  ELSIF v_account.status='PENDING_ACTIVATION' AND v_profile.must_change_password THEN
    PERFORM public.complete_initial_password_change(p_user_id);
  END IF;
  UPDATE app_private.school_auth_accounts SET status='ACTIVE',resume_status=NULL,
    email_verified_at=coalesce(email_verified_at,now()),activated_at=coalesce(activated_at,now()),
    operation_id=NULL,operation_started_at=NULL,
    activation_operation_is_new=false,activation_operation_ttl_seconds=NULL,
    updated_at=now()
    WHERE school_id=v_account.school_id;
  INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id)
    VALUES(p_user_id,'UPDATE','schools',v_account.school_id);
  RETURN true;
END;
$$;

CREATE FUNCTION public.school_recovery_request(p_npsn text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_account app_private.school_auth_accounts; v_email text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Server role required' USING ERRCODE='42501';
  END IF;
  SELECT a.* INTO v_account FROM app_private.school_auth_accounts a
    JOIN public.schools s ON s.id=a.school_id
    JOIN public.profiles p ON p.user_id=a.user_id AND p.school_id=s.id
    WHERE s.npsn=p_npsn AND s.is_active AND a.status='ACTIVE'
      AND p.is_active AND p.role='petugas_sekolah' FOR UPDATE OF a;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_account.last_sent_at > now()-interval '60 seconds' THEN
    RAISE EXCEPTION 'Please wait before resending' USING ERRCODE='55P03';
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id=v_account.user_id
    AND lower(email)=v_account.email AND email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN RETURN NULL; END IF;
  UPDATE app_private.school_auth_accounts SET last_sent_at=now() WHERE school_id=v_account.school_id;
  INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id)
    VALUES(NULL,'UPDATE','schools',v_account.school_id);
  RETURN jsonb_build_object('email',v_email);
END;
$$;

-- Admin profile changes keep their original guards and audit attribution.
-- A native pending claim cannot be promoted by the legacy profile synchronizer.
CREATE OR REPLACE FUNCTION app_private.sync_school_auth_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_account app_private.school_auth_accounts; v_email text; v_verified timestamptz; v_ready boolean;
BEGIN
  IF current_setting('app.school_auth_internal',true)='verified'
    AND auth.role() IS NOT DISTINCT FROM 'service_role' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND OLD.role='petugas_sekolah'
    AND (NEW.role<>'petugas_sekolah' OR OLD.school_id IS DISTINCT FROM NEW.school_id) THEN
    UPDATE app_private.school_auth_accounts SET status='SUSPENDED',resume_status='UNCLAIMED',
      user_id=NULL,email=NULL,email_verified_at=NULL,updated_at=now()
      WHERE school_id=OLD.school_id AND user_id=OLD.user_id;
  END IF;
  IF NEW.role<>'petugas_sekolah' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND OLD.role=NEW.role AND OLD.school_id IS NOT DISTINCT FROM NEW.school_id
    AND OLD.is_active=NEW.is_active THEN RETURN NEW; END IF;
  SELECT * INTO v_account FROM app_private.school_auth_accounts WHERE school_id=NEW.school_id FOR UPDATE;
  IF v_account.user_id IS NOT NULL AND v_account.user_id<>NEW.user_id THEN
    IF NOT NEW.is_active THEN RETURN NEW; END IF;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id=v_account.user_id AND is_active)
      OR (v_account.status='PENDING_ACTIVATION' AND v_account.activation_expires_at>now()) THEN
      RAISE EXCEPTION 'School account identity already assigned' USING ERRCODE='23505';
    END IF;
  END IF;
  SELECT lower(email),email_confirmed_at,coalesce(encrypted_password,'')<>'' AND email_confirmed_at IS NOT NULL
    INTO v_email,v_verified,v_ready FROM auth.users WHERE id=NEW.user_id;
  UPDATE app_private.school_auth_accounts SET user_id=NEW.user_id,email=v_email,email_verified_at=v_verified,
    status=CASE WHEN NOT NEW.is_active THEN 'SUSPENDED'
      WHEN v_account.activation_request_id IS NOT NULL AND v_account.activated_at IS NULL THEN 'PENDING_ACTIVATION'
      WHEN v_ready THEN 'ACTIVE' WHEN v_email IS NOT NULL THEN 'PENDING_ACTIVATION' ELSE 'UNCLAIMED' END,
    resume_status=CASE WHEN NOT NEW.is_active THEN v_account.status ELSE NULL END,
    activated_at=CASE WHEN v_ready AND v_account.activation_request_id IS NULL THEN coalesce(activated_at,now()) ELSE activated_at END,
    updated_at=now() WHERE school_id=NEW.school_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.can_read_school(p_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=(SELECT auth.uid()) AND p.is_active
    AND (p.role IN ('admin_dinas','viewer_dinas') OR (p.role='petugas_sekolah'
      AND p.must_change_password=false AND p.school_id=p_school_id
      AND EXISTS (SELECT 1 FROM public.schools s JOIN app_private.school_auth_accounts a ON a.school_id=s.id
        WHERE s.id=p.school_id AND s.is_active AND a.status='ACTIVE' AND a.user_id=p.user_id))));
$$;
CREATE OR REPLACE FUNCTION app_private.can_write_school(p_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p JOIN public.schools s ON s.id=p.school_id
    JOIN app_private.school_auth_accounts a ON a.school_id=s.id WHERE p.user_id=(SELECT auth.uid())
      AND p.is_active AND p.role='petugas_sekolah' AND p.must_change_password=false
      AND p.school_id=p_school_id AND s.is_active AND a.status='ACTIVE' AND a.user_id=p.user_id);
$$;
CREATE OR REPLACE FUNCTION app_private.current_school_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT p.school_id FROM public.profiles p WHERE p.user_id=(SELECT auth.uid())
    AND p.must_change_password=false AND app_private.can_write_school(p.school_id);
$$;

REVOKE ALL ON FUNCTION public.school_auth_lookup(text),
  public.school_activation_request(text,text,integer),public.school_activation_bind(uuid,uuid,uuid),
  public.school_activation_bind(uuid,uuid),
  public.school_activation_cancel(uuid,uuid),
  public.school_activation_context(uuid),public.complete_school_activation(uuid,uuid),
  public.school_recovery_request(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.school_auth_lookup(text),
  public.school_activation_request(text,text,integer),public.school_activation_bind(uuid,uuid,uuid),
  public.school_activation_bind(uuid,uuid),
  public.school_activation_cancel(uuid,uuid),
  public.school_activation_context(uuid),public.complete_school_activation(uuid,uuid),
  public.school_recovery_request(text) TO service_role;
REVOKE ALL ON FUNCTION app_private.can_read_school(uuid),app_private.can_write_school(uuid),
  app_private.current_school_id(),app_private.sync_school_auth_profile() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.can_read_school(uuid),app_private.can_write_school(uuid),
  app_private.current_school_id() TO authenticated;
COMMIT;
