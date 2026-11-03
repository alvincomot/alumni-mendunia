-- Additive school lifecycle metadata. Password hashes remain exclusively in Auth.
-- Requires migrations through 20261027000100. Review before hosted application.
BEGIN;

CREATE TABLE app_private.school_auth_accounts (
  school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE RESTRICT,
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'UNCLAIMED'
    CHECK (status IN ('UNCLAIMED','PENDING_ACTIVATION','ACTIVE','SUSPENDED')),
  resume_status text CHECK (resume_status IN ('UNCLAIMED','PENDING_ACTIVATION','ACTIVE')),
  email text UNIQUE CHECK (email IS NULL OR (email = lower(btrim(email)) AND length(email) BETWEEN 3 AND 254 AND email LIKE '%@%')),
  email_verified_at timestamptz,
  activated_at timestamptz,
  last_sent_at timestamptz,
  operation_id uuid UNIQUE,
  operation_started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'PENDING_ACTIVATION' OR email IS NOT NULL),
  CHECK (status <> 'ACTIVE' OR user_id IS NOT NULL)
);
CREATE TABLE app_private.school_auth_tokens (
  school_id uuid REFERENCES app_private.school_auth_accounts(school_id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('activation','reset')),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id,purpose)
);
REVOKE ALL ON TABLE app_private.school_auth_accounts, app_private.school_auth_tokens
  FROM PUBLIC, anon, authenticated, service_role;

-- Prefer the one active profile. Ambiguous inactive-only mappings are suspended
-- for review; no profile, Auth identity, or alumni record is removed or reassigned.
INSERT INTO app_private.school_auth_accounts(school_id,user_id,status,resume_status,email,email_verified_at,activated_at)
SELECT s.id, chosen.user_id,
  CASE WHEN counts.n > 0 AND chosen.user_id IS NULL THEN 'SUSPENDED'
       WHEN chosen.user_id IS NULL THEN 'UNCLAIMED'
       WHEN NOT chosen.is_active THEN 'SUSPENDED'
       WHEN coalesce(u.encrypted_password,'') <> '' AND u.email_confirmed_at IS NOT NULL THEN 'ACTIVE'
       WHEN nullif(btrim(u.email),'') IS NOT NULL THEN 'PENDING_ACTIVATION'
       ELSE 'SUSPENDED' END,
  CASE WHEN chosen.user_id IS NOT NULL AND NOT chosen.is_active THEN
    CASE WHEN coalesce(u.encrypted_password,'') <> '' AND u.email_confirmed_at IS NOT NULL THEN 'ACTIVE'
         WHEN nullif(btrim(u.email),'') IS NOT NULL THEN 'PENDING_ACTIVATION'
         ELSE 'UNCLAIMED' END ELSE NULL END,
  nullif(lower(btrim(u.email)),''), u.email_confirmed_at,
  CASE WHEN coalesce(u.encrypted_password,'') <> '' AND u.email_confirmed_at IS NOT NULL THEN coalesce(u.last_sign_in_at,u.created_at,now()) ELSE NULL END
FROM public.schools s
LEFT JOIN LATERAL (SELECT count(*) AS n FROM public.profiles p WHERE p.school_id=s.id AND p.role='petugas_sekolah') counts ON true
LEFT JOIN LATERAL (
  SELECT p.user_id,p.is_active FROM public.profiles p
  WHERE p.school_id=s.id AND p.role='petugas_sekolah'
    AND (p.is_active OR counts.n=1)
  ORDER BY p.is_active DESC,p.created_at,p.user_id LIMIT 1
) chosen ON true
LEFT JOIN auth.users u ON u.id=chosen.user_id;

CREATE FUNCTION app_private.initialize_school_auth()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO app_private.school_auth_accounts(school_id) VALUES(NEW.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER schools_initialize_auth AFTER INSERT ON public.schools
FOR EACH ROW EXECUTE FUNCTION app_private.initialize_school_auth();

-- Keep existing trusted provisioning, invitations and profile administration
-- compatible. Internal lifecycle writes skip this synchronizer, never the guards.
CREATE FUNCTION app_private.sync_school_auth_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_account app_private.school_auth_accounts; v_email text; v_verified timestamptz; v_ready boolean;
BEGIN
  IF current_setting('app.school_auth_internal',true)='verified' AND auth.role() IS NOT DISTINCT FROM 'service_role' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND OLD.role='petugas_sekolah' AND (NEW.role<>'petugas_sekolah' OR OLD.school_id IS DISTINCT FROM NEW.school_id) THEN
    UPDATE app_private.school_auth_accounts SET status='SUSPENDED',resume_status='UNCLAIMED',user_id=NULL,email=NULL,email_verified_at=NULL,updated_at=now()
      WHERE school_id=OLD.school_id AND user_id=OLD.user_id;
    DELETE FROM app_private.school_auth_tokens WHERE school_id=OLD.school_id;
  END IF;
  IF NEW.role<>'petugas_sekolah' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND OLD.role=NEW.role AND OLD.school_id IS NOT DISTINCT FROM NEW.school_id AND OLD.is_active=NEW.is_active THEN RETURN NEW; END IF;
  SELECT * INTO v_account FROM app_private.school_auth_accounts WHERE school_id=NEW.school_id FOR UPDATE;
  IF v_account.user_id IS NOT NULL AND v_account.user_id<>NEW.user_id THEN
    IF NOT NEW.is_active THEN RETURN NEW; END IF;
    PERFORM 1 FROM public.profiles WHERE user_id=v_account.user_id AND is_active;
    IF FOUND THEN RAISE EXCEPTION 'School account identity already assigned' USING ERRCODE='23505'; END IF;
  END IF;
  SELECT nullif(lower(btrim(email)),''),email_confirmed_at,
    coalesce(encrypted_password,'')<>'' AND email_confirmed_at IS NOT NULL
    INTO v_email,v_verified,v_ready FROM auth.users WHERE id=NEW.user_id;
  UPDATE app_private.school_auth_accounts SET
    user_id=NEW.user_id,email=v_email,email_verified_at=v_verified,
    status=CASE WHEN NOT NEW.is_active THEN 'SUSPENDED'
      WHEN v_ready THEN 'ACTIVE' WHEN v_email IS NOT NULL THEN 'PENDING_ACTIVATION' ELSE 'UNCLAIMED' END,
    resume_status=CASE WHEN NOT NEW.is_active THEN
      CASE WHEN v_ready THEN 'ACTIVE' WHEN v_email IS NOT NULL THEN 'PENDING_ACTIVATION' ELSE 'UNCLAIMED' END ELSE NULL END,
    activated_at=CASE WHEN v_ready THEN coalesce(activated_at,now()) ELSE activated_at END,
    updated_at=now()
  WHERE school_id=NEW.school_id;
  DELETE FROM app_private.school_auth_tokens WHERE school_id=NEW.school_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER profiles_sync_school_auth AFTER INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION app_private.sync_school_auth_profile();

CREATE FUNCTION public.school_auth_lookup(p_npsn text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('id',s.id,'npsn',s.npsn,'name',s.name,
    'status',CASE WHEN NOT s.is_active THEN 'SUSPENDED' ELSE a.status END,
    'email',a.email,'user_id',a.user_id,'busy',a.operation_id IS NOT NULL)
  FROM public.schools s JOIN app_private.school_auth_accounts a ON a.school_id=s.id WHERE s.npsn=p_npsn;
$$;

CREATE FUNCTION public.school_auth_request(p_npsn text,p_email text,p_purpose text,p_token_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_school public.schools; v_account app_private.school_auth_accounts;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server role required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_school FROM public.schools WHERE npsn=p_npsn FOR SHARE;
  IF NOT FOUND OR NOT v_school.is_active THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_account FROM app_private.school_auth_accounts WHERE school_id=v_school.id FOR UPDATE;
  IF v_account.status='SUSPENDED' OR
    (v_account.operation_id IS NOT NULL AND v_account.operation_started_at > now()-interval '5 minutes') THEN
    RAISE EXCEPTION 'Account unavailable' USING ERRCODE='42501'; END IF;
  IF v_account.last_sent_at > now()-interval '60 seconds' THEN RAISE EXCEPTION 'Please wait before resending' USING ERRCODE='55P03'; END IF;
  IF p_purpose='activation' THEN
    IF v_account.status='UNCLAIMED' THEN
      IF p_email IS NULL THEN RAISE EXCEPTION 'Email required' USING ERRCODE='23514'; END IF;
      UPDATE app_private.school_auth_accounts SET email=lower(btrim(p_email)),status='PENDING_ACTIVATION',updated_at=now()
        WHERE school_id=v_school.id RETURNING * INTO v_account;
    ELSIF v_account.status<>'PENDING_ACTIVATION' OR (p_email IS NOT NULL AND lower(btrim(p_email)) IS DISTINCT FROM v_account.email) THEN
      RAISE EXCEPTION 'Account state changed' USING ERRCODE='42501';
    END IF;
  ELSIF p_purpose='reset' THEN
    IF v_account.status<>'ACTIVE' OR v_account.email IS NULL OR p_email IS NOT NULL THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE='42501'; END IF;
  ELSE RAISE EXCEPTION 'Invalid purpose' USING ERRCODE='23514'; END IF;
  INSERT INTO app_private.school_auth_tokens(school_id,purpose,token_hash,expires_at)
    VALUES(v_school.id,p_purpose,p_token_hash,now()+interval '30 minutes')
    ON CONFLICT(school_id,purpose) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at,used_at=NULL,created_at=now();
  -- Fence a stale in-flight Auth writer without opening its access gate.
  UPDATE app_private.school_auth_accounts SET last_sent_at=now(),updated_at=now(),
    operation_id=CASE WHEN operation_id IS NULL THEN NULL ELSE gen_random_uuid() END
    WHERE school_id=v_school.id;
  INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id) VALUES(NULL,'UPDATE','schools',v_school.id);
  RETURN jsonb_build_object('id',v_school.id,'email',v_account.email,'name',v_school.name);
END;
$$;

CREATE FUNCTION public.school_auth_validate(p_hash text,p_purpose text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('valid',t.used_at IS NULL AND t.expires_at>now() AND s.is_active AND
      a.status=CASE WHEN p_purpose='activation' THEN 'PENDING_ACTIVATION' ELSE 'ACTIVE' END,
    'reason',CASE WHEN t.used_at IS NOT NULL THEN 'used' WHEN t.expires_at<=now() THEN 'expired' ELSE 'blocked' END,
    'schoolName',s.name)
  FROM app_private.school_auth_tokens t JOIN app_private.school_auth_accounts a ON a.school_id=t.school_id
  JOIN public.schools s ON s.id=a.school_id WHERE t.token_hash=p_hash AND t.purpose=p_purpose;
$$;

CREATE FUNCTION public.school_auth_begin(p_hash text,p_purpose text,p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_account app_private.school_auth_accounts; v_token app_private.school_auth_tokens; v_school public.schools;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server role required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_token FROM app_private.school_auth_tokens WHERE token_hash=p_hash AND purpose=p_purpose;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid token' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_school FROM public.schools WHERE id=v_token.school_id FOR SHARE;
  SELECT * INTO v_account FROM app_private.school_auth_accounts WHERE school_id=v_token.school_id FOR UPDATE;
  SELECT * INTO v_token FROM app_private.school_auth_tokens WHERE token_hash=p_hash AND purpose=p_purpose FOR UPDATE;
  IF NOT FOUND OR v_token.used_at IS NOT NULL OR v_token.expires_at<=now() OR NOT v_school.is_active OR
    v_account.status IS DISTINCT FROM (CASE WHEN p_purpose='activation' THEN 'PENDING_ACTIVATION' ELSE 'ACTIVE' END) OR
    (v_account.operation_id IS NOT NULL AND v_account.operation_started_at>now()-interval '5 minutes') THEN
    RAISE EXCEPTION 'Invalid or expired token' USING ERRCODE='42501'; END IF;
  UPDATE app_private.school_auth_tokens SET used_at=now() WHERE token_hash=p_hash;
  UPDATE app_private.school_auth_accounts SET operation_id=p_operation,operation_started_at=now(),updated_at=now() WHERE school_id=v_account.school_id;
  RETURN jsonb_build_object('school_id',v_account.school_id,'user_id',v_account.user_id,'email',v_account.email,'name',v_school.name);
END;
$$;

CREATE FUNCTION public.school_auth_complete(p_operation uuid,p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_account app_private.school_auth_accounts; v_profile public.profiles;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server role required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_account FROM app_private.school_auth_accounts WHERE operation_id=p_operation FOR UPDATE;
  IF NOT FOUND OR v_account.operation_started_at<=now()-interval '5 minutes' OR v_account.status NOT IN ('PENDING_ACTIVATION','ACTIVE') OR
     (v_account.user_id IS NOT NULL AND v_account.user_id<>p_user_id) THEN RAISE EXCEPTION 'Invalid workflow' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.schools WHERE id=v_account.school_id AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School unavailable' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM auth.users WHERE id=p_user_id AND lower(btrim(email))=v_account.email
    AND email_confirmed_at IS NOT NULL AND coalesce(encrypted_password,'')<>'';
  IF NOT FOUND THEN RAISE EXCEPTION 'Auth password update required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE user_id=p_user_id FOR UPDATE;
  IF FOUND AND (v_profile.role<>'petugas_sekolah' OR v_profile.school_id IS DISTINCT FROM v_account.school_id) THEN
    RAISE EXCEPTION 'Account assignment mismatch' USING ERRCODE='42501'; END IF;
  PERFORM set_config('app.school_auth_internal','verified',true);
  PERFORM set_config('app.password_change_actor_id',p_user_id::text,true);
  IF v_profile.user_id IS NULL THEN
    INSERT INTO public.profiles(user_id,full_name,role,school_id,is_active)
    SELECT p_user_id,left('Petugas '||name,150),'petugas_sekolah',id,true FROM public.schools WHERE id=v_account.school_id;
  ELSE
    UPDATE public.profiles SET is_active=true WHERE user_id=p_user_id;
    IF v_profile.must_change_password THEN PERFORM public.complete_initial_password_change(p_user_id); END IF;
  END IF;
  UPDATE app_private.school_auth_accounts SET user_id=p_user_id,status='ACTIVE',resume_status=NULL,
    email_verified_at=now(),activated_at=coalesce(activated_at,now()),operation_id=NULL,operation_started_at=NULL,updated_at=now()
    WHERE school_id=v_account.school_id;
  UPDATE app_private.school_auth_tokens SET used_at=coalesce(used_at,now()) WHERE school_id=v_account.school_id;
  INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id) VALUES(p_user_id,'UPDATE','schools',v_account.school_id);
  RETURN true;
END;
$$;

CREATE FUNCTION public.school_auth_abort(p_operation uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server role required' USING ERRCODE='42501'; END IF;
  UPDATE app_private.school_auth_accounts SET operation_id=NULL,operation_started_at=NULL,updated_at=now() WHERE operation_id=p_operation;
END;
$$;

-- Existing invitation/mandatory-password pages call this only after Auth has
-- accepted the password and the session user has been verified again.
CREATE FUNCTION public.school_auth_legacy_complete(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_school uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server role required' USING ERRCODE='42501'; END IF;
  SELECT p.school_id INTO v_school FROM public.profiles p JOIN auth.users u ON u.id=p.user_id
    JOIN app_private.school_auth_accounts a ON a.school_id=p.school_id AND a.user_id=p.user_id
    JOIN public.schools s ON s.id=p.school_id
    WHERE p.user_id=p_user_id AND p.role='petugas_sekolah' AND p.is_active AND s.is_active
      AND a.status IN ('ACTIVE','PENDING_ACTIVATION') AND a.operation_id IS NULL
      AND u.email_confirmed_at IS NOT NULL AND coalesce(u.encrypted_password,'')<>''
    FOR UPDATE OF a;
  IF v_school IS NULL THEN RETURN false; END IF;
  UPDATE app_private.school_auth_accounts SET status='ACTIVE',email_verified_at=coalesce(email_verified_at,now()),
    activated_at=coalesce(activated_at,now()),updated_at=now() WHERE school_id=v_school;
  RETURN true;
END;
$$;

CREATE FUNCTION public.school_auth_admin_details(p_school_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  IF app_private.is_admin() IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Active administrator required' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('status',a.status,'email',a.email,'user_id',a.user_id,'busy',a.operation_id IS NOT NULL)
    INTO v_result FROM app_private.school_auth_accounts a WHERE school_id=p_school_id;
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.school_auth_admin_change(p_school_id uuid,p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_account app_private.school_auth_accounts; v_state text;
BEGIN
  PERFORM pg_advisory_xact_lock(20261023,2);
  IF app_private.is_admin() IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Active administrator required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_account FROM app_private.school_auth_accounts WHERE school_id=p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School unavailable' USING ERRCODE='23514'; END IF;
  IF p_action='suspend' THEN
    v_state:='SUSPENDED';
  ELSIF p_action='restore' AND v_account.status='SUSPENDED' THEN
    v_state:=coalesce(v_account.resume_status,'UNCLAIMED');
  ELSIF p_action='unclaim' THEN
    v_state:='UNCLAIMED';
  ELSE RAISE EXCEPTION 'Invalid operation' USING ERRCODE='23514'; END IF;
  UPDATE app_private.school_auth_accounts SET
    status=v_state,resume_status=CASE WHEN p_action='suspend' AND status<>'SUSPENDED' THEN status WHEN p_action='suspend' THEN resume_status ELSE NULL END,
    email=CASE WHEN p_action='unclaim' THEN NULL ELSE email END,
    email_verified_at=CASE WHEN p_action='unclaim' THEN NULL ELSE email_verified_at END,
    last_sent_at=NULL,operation_id=NULL,operation_started_at=NULL,updated_at=now() WHERE school_id=p_school_id;
  -- Existing profile guard and audit trigger remain authoritative. Synchronizer
  -- sees the already-updated lifecycle and must not re-derive a different state.
  UPDATE public.profiles SET is_active=(v_state='ACTIVE') WHERE user_id=v_account.user_id AND is_active IS DISTINCT FROM (v_state='ACTIVE');
  UPDATE app_private.school_auth_accounts SET status=v_state,
    email=CASE WHEN p_action='unclaim' THEN NULL ELSE v_account.email END,
    email_verified_at=CASE WHEN p_action='unclaim' THEN NULL ELSE v_account.email_verified_at END,
    resume_status=CASE WHEN p_action='suspend' THEN coalesce(v_account.resume_status,nullif(v_account.status,'SUSPENDED')) ELSE NULL END
    WHERE school_id=p_school_id;
  DELETE FROM app_private.school_auth_tokens WHERE school_id=p_school_id;
  INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id) VALUES(auth.uid(),'UPDATE','schools',p_school_id);
END;
$$;

-- RLS policies are unchanged. Their existing helpers now require a completed
-- lifecycle and exclude in-flight credential changes, including old JWTs.
CREATE OR REPLACE FUNCTION app_private.can_read_school(p_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=(SELECT auth.uid()) AND p.is_active AND
    (p.role IN ('admin_dinas','viewer_dinas') OR (p.role='petugas_sekolah' AND p.school_id=p_school_id AND
      EXISTS(SELECT 1 FROM public.schools s JOIN app_private.school_auth_accounts a ON a.school_id=s.id
        WHERE s.id=p.school_id AND s.is_active AND a.status='ACTIVE' AND a.user_id=p.user_id AND a.operation_id IS NULL))));
$$;
CREATE OR REPLACE FUNCTION app_private.can_write_school(p_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles p JOIN public.schools s ON s.id=p.school_id
    JOIN app_private.school_auth_accounts a ON a.school_id=s.id WHERE p.user_id=(SELECT auth.uid())
    AND p.is_active AND p.role='petugas_sekolah' AND p.school_id=p_school_id AND s.is_active
    AND a.status='ACTIVE' AND a.user_id=p.user_id AND a.operation_id IS NULL);
$$;
CREATE OR REPLACE FUNCTION app_private.current_school_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT p.school_id FROM public.profiles p WHERE p.user_id=(SELECT auth.uid()) AND app_private.can_write_school(p.school_id);
$$;

REVOKE ALL ON FUNCTION app_private.initialize_school_auth(),app_private.sync_school_auth_profile()
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.school_auth_lookup(text),public.school_auth_request(text,text,text,text),
  public.school_auth_validate(text,text),public.school_auth_begin(text,text,uuid),public.school_auth_complete(uuid,uuid),public.school_auth_abort(uuid),
  public.school_auth_legacy_complete(uuid),
  public.school_auth_admin_details(uuid),public.school_auth_admin_change(uuid,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.school_auth_lookup(text),public.school_auth_request(text,text,text,text),
  public.school_auth_validate(text,text),public.school_auth_begin(text,text,uuid),public.school_auth_complete(uuid,uuid),public.school_auth_abort(uuid)
  ,public.school_auth_legacy_complete(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.school_auth_admin_details(uuid),public.school_auth_admin_change(uuid,text) TO authenticated;
COMMIT;
