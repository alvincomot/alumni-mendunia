-- ============================================================================
-- ALUMNI MENDUNIA SMK | Database MVP v1.2 | 21 October 2026
-- TARGET: Fresh, empty Supabase PostgreSQL project only.
-- RUN ONCE via Supabase SQL Editor (or an approved migrations workflow).
-- USE FICTIONAL TEST DATA ONLY. NOT PRODUCTION SECURITY CERTIFICATION.
-- This migration MUST NOT be applied on top of v1.1: it is a replacement.
-- ============================================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA app_private TO authenticated;

-- 1. TABLES ------------------------------------------------------------------
CREATE TABLE public.schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  npsn varchar(8) NOT NULL UNIQUE CHECK (npsn ~ '^[0-9]{8}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  city text NOT NULL CHECK (length(btrim(city)) BETWEEN 1 AND 100),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  full_name text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 1 AND 150),
  role text NOT NULL CHECK (role IN (
    'admin_dinas', 'viewer_dinas', 'petugas_sekolah'
  )),
  school_id uuid REFERENCES public.schools(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_school_by_role CHECK (
    (role = 'petugas_sekolah' AND school_id IS NOT NULL)
    OR (role IN ('admin_dinas', 'viewer_dinas') AND school_id IS NULL)
  )
);

CREATE TABLE public.alumni (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  full_name text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 1 AND 150),
  graduation_year smallint NOT NULL CHECK (graduation_year BETWEEN 1990 AND 2100),
  major text NOT NULL CHECK (length(btrim(major)) BETWEEN 1 AND 150),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumni_id uuid NOT NULL REFERENCES public.alumni(id) ON DELETE RESTRICT,
  destination_country text NOT NULL
    CHECK (length(btrim(destination_country)) BETWEEN 1 AND 100),
  work_sector text CHECK (work_sector IS NULL OR length(btrim(work_sector)) <= 150),
  company_name text CHECK (company_name IS NULL OR length(btrim(company_name)) <= 200),
  status text NOT NULL DEFAULT 'persiapan_berangkat' CHECK (status IN (
    'persiapan_berangkat', 'aktif_bekerja', 'selesai_kontrak', 'batal_berangkat'
  )),
  planned_departure date,
  actual_departure date,
  employment_start date,
  contract_end_date date,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT placement_dates_by_status CHECK (
    (actual_departure IS NULL OR status IN ('aktif_bekerja', 'selesai_kontrak'))
    AND (employment_start IS NULL OR status IN ('aktif_bekerja', 'selesai_kontrak'))
    AND (contract_end_date IS NULL OR status = 'selesai_kontrak')
  ),
  CONSTRAINT placement_date_order CHECK (
    (actual_departure IS NULL OR employment_start IS NULL
      OR employment_start >= actual_departure)
    AND (employment_start IS NULL OR contract_end_date IS NULL
      OR contract_end_date >= employment_start)
    AND (actual_departure IS NULL OR contract_end_date IS NULL
      OR contract_end_date >= actual_departure)
  )
);

-- Each alumnus has at most one current placement, INCLUDING when it ends.
CREATE UNIQUE INDEX placements_one_current_per_alumni
  ON public.placements (alumni_id) WHERE is_current = true;

CREATE TABLE public.status_histories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id uuid NOT NULL REFERENCES public.placements(id) ON DELETE RESTRICT,
  old_status text CHECK (old_status IS NULL OR old_status IN (
    'persiapan_berangkat', 'aktif_bekerja', 'selesai_kontrak', 'batal_berangkat'
  )),
  new_status text NOT NULL CHECK (new_status IN (
    'persiapan_berangkat', 'aktif_bekerja', 'selesai_kontrak', 'batal_berangkat'
  )),
  changed_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  note text CHECK (note IS NULL OR length(note) <= 500),
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT history_status_must_change CHECK (
    old_status IS NULL OR old_status <> new_status
  )
);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  entity_type text NOT NULL CHECK (entity_type IN (
    'schools', 'profiles', 'alumni', 'placements'
  )),
  entity_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX profiles_school_id_idx ON public.profiles(school_id);
CREATE INDEX alumni_school_id_idx ON public.alumni(school_id);
CREATE INDEX alumni_graduation_year_idx ON public.alumni(graduation_year);
CREATE INDEX placements_alumni_id_idx ON public.placements(alumni_id);
CREATE INDEX placements_status_idx ON public.placements(status) WHERE is_current = true;
CREATE INDEX status_histories_placement_time_idx
  ON public.status_histories(placement_id, changed_at DESC);
CREATE INDEX audit_logs_occurred_at_idx ON public.audit_logs(occurred_at DESC);

-- 2. AUTHORIZATION HELPERS --------------------------------------------------
-- SECURITY DEFINER helpers live in a NON-EXPOSED schema. Never add
-- app_private to Supabase API -> Exposed schemas.
CREATE FUNCTION app_private.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = (SELECT auth.uid())
      AND p.is_active = true AND p.role = 'admin_dinas'
  );
$$;

CREATE FUNCTION app_private.can_read_school(p_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = (SELECT auth.uid()) AND p.is_active = true
      AND (
        p.role IN ('admin_dinas', 'viewer_dinas')
        OR (
          p.role = 'petugas_sekolah'
          AND p.school_id = p_school_id
          AND EXISTS (
            SELECT 1 FROM public.schools s
            WHERE s.id = p.school_id AND s.is_active = true
          )
        )
      )
  );
$$;

CREATE FUNCTION app_private.can_write_school(p_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.schools s ON s.id = p.school_id
    WHERE p.user_id = (SELECT auth.uid())
      AND p.is_active = true AND p.role = 'petugas_sekolah'
      AND p.school_id = p_school_id AND s.is_active = true
  );
$$;

CREATE FUNCTION app_private.current_school_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.school_id FROM public.profiles p
  JOIN public.schools s ON s.id = p.school_id
  WHERE p.user_id = (SELECT auth.uid())
    AND p.is_active = true AND p.role = 'petugas_sekolah'
    AND s.is_active = true;
$$;

CREATE FUNCTION app_private.can_read_alumni(p_alumni_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.alumni a
    WHERE a.id = p_alumni_id AND app_private.can_read_school(a.school_id)
  );
$$;

CREATE FUNCTION app_private.can_write_alumni(p_alumni_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.alumni a
    WHERE a.id = p_alumni_id AND app_private.can_write_school(a.school_id)
  );
$$;

CREATE FUNCTION app_private.can_read_placement(p_placement_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.placements pl
    JOIN public.alumni a ON a.id = pl.alumni_id
    WHERE pl.id = p_placement_id AND app_private.can_read_school(a.school_id)
  );
$$;

-- 3. AUTOMATIC TRIGGERS -----------------------------------------------------
CREATE FUNCTION app_private.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER alumni_touch_updated_at
  BEFORE UPDATE ON public.alumni FOR EACH ROW
  EXECUTE FUNCTION app_private.touch_updated_at();
CREATE TRIGGER placements_touch_updated_at
  BEFORE UPDATE ON public.placements FOR EACH ROW
  EXECUTE FUNCTION app_private.touch_updated_at();

-- Never take school_id for a newly created alumnus from untrusted clients.
CREATE FUNCTION app_private.assign_alumni_school()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.school_id := app_private.current_school_id();
    IF NEW.school_id IS NULL THEN
      RAISE EXCEPTION 'Akun tidak memiliki akses sekolah aktif'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER alumni_assign_school
  BEFORE INSERT ON public.alumni FOR EACH ROW
  EXECUTE FUNCTION app_private.assign_alumni_school();

CREATE FUNCTION app_private.protect_alumni_school()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.school_id IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Sekolah asal alumni tidak boleh diubah';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER alumni_school_immutable
  BEFORE UPDATE ON public.alumni FOR EACH ROW
  EXECUTE FUNCTION app_private.protect_alumni_school();

CREATE FUNCTION app_private.validate_placement_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.alumni_id IS DISTINCT FROM NEW.alumni_id THEN
    RAISE EXCEPTION 'Penempatan tidak boleh dipindahkan ke alumni lain';
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT OLD.is_current THEN
      RAISE EXCEPTION 'Status penempatan historis tidak boleh diubah';
    END IF;
    IF NOT (
      (OLD.status = 'persiapan_berangkat'
        AND NEW.status IN ('aktif_bekerja', 'batal_berangkat'))
      OR (OLD.status = 'aktif_bekerja' AND NEW.status = 'selesai_kontrak')
    ) THEN
      RAISE EXCEPTION 'Transisi status penempatan tidak valid';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER placements_validate_update
  BEFORE UPDATE ON public.placements FOR EACH ROW
  EXECUTE FUNCTION app_private.validate_placement_update();

-- New placement + any status transition automatically create history entries.
-- The trigger runs in the SAME transaction as the underlying operation.
CREATE FUNCTION app_private.record_status_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.status_histories
      (placement_id, old_status, new_status, changed_by, note)
    VALUES (NEW.id, NULL, NEW.status, auth.uid(), NULL);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.status_histories
      (placement_id, old_status, new_status, changed_by, note)
    VALUES (
      NEW.id, OLD.status, NEW.status, auth.uid(),
      NULLIF(pg_catalog.current_setting('app.status_note', true), '')
    );
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER placements_history_insert
  AFTER INSERT ON public.placements FOR EACH ROW
  EXECUTE FUNCTION app_private.record_status_history();
CREATE TRIGGER placements_history_update
  AFTER UPDATE OF status ON public.placements FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION app_private.record_status_history();

-- Administrative audit trail. Avoid saving alumni PII as JSON snapshots.
CREATE FUNCTION app_private.record_audit_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_row jsonb;
  v_entity_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF to_jsonb(OLD) = to_jsonb(NEW) THEN
      RETURN NEW;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    v_row := to_jsonb(OLD);
  ELSE
    v_row := to_jsonb(NEW);
  END IF;
  v_entity_id := COALESCE(v_row->>'id', v_row->>'user_id')::uuid;
  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id)
  VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, v_entity_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER schools_audit AFTER INSERT OR UPDATE OR DELETE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION app_private.record_audit_log();
CREATE TRIGGER profiles_audit AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION app_private.record_audit_log();
CREATE TRIGGER alumni_audit AFTER INSERT OR UPDATE OR DELETE ON public.alumni
  FOR EACH ROW EXECUTE FUNCTION app_private.record_audit_log();
CREATE TRIGGER placements_audit AFTER INSERT OR UPDATE OR DELETE ON public.placements
  FOR EACH ROW EXECUTE FUNCTION app_private.record_audit_log();

-- 4. ATOMIC, AUTHORIZED BUSINESS OPERATIONS --------------------------------
-- The actual elevated functions live in app_private, not in exposed public.
-- Public RPC wrappers below use SECURITY INVOKER.

CREATE FUNCTION app_private.create_placement(
  p_alumni_id uuid,
  p_destination_country text,
  p_work_sector text,
  p_company_name text,
  p_planned_departure date,
  p_initial_status text,
  p_actual_departure date,
  p_employment_start date,
  p_contract_end_date date
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu'
      USING ERRCODE = '42501';
  END IF;
  IF p_initial_status IS NULL OR p_initial_status NOT IN (
    'persiapan_berangkat', 'aktif_bekerja', 'selesai_kontrak', 'batal_berangkat'
  ) THEN
    RAISE EXCEPTION 'Status awal penempatan tidak valid';
  END IF;
  IF p_actual_departure IS NOT NULL AND p_actual_departure > CURRENT_DATE THEN
    RAISE EXCEPTION 'Tanggal keberangkatan aktual tidak boleh di masa depan';
  END IF;
  IF p_contract_end_date IS NOT NULL AND p_contract_end_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Tanggal selesai kontrak tidak boleh di masa depan';
  END IF;

  -- Serialize concurrent placement creation for the same alumnus.
  PERFORM 1 FROM public.alumni a
  WHERE a.id = p_alumni_id AND app_private.can_write_school(a.school_id)
  FOR UPDATE OF a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Alumni tidak ditemukan atau tidak diizinkan'
      USING ERRCODE = '42501';
  END IF;

  -- Previous placement remains as history, even after completion.
  UPDATE public.placements
    SET is_current = false
    WHERE alumni_id = p_alumni_id AND is_current = true;

  -- Existing working alumni can be entered with their real initial status.
  -- This is not a status transition; it is the first recorded placement state.
  INSERT INTO public.placements (
    alumni_id, destination_country, work_sector, company_name,
    planned_departure, status, actual_departure, employment_start,
    contract_end_date, is_current
  ) VALUES (
    p_alumni_id, p_destination_country, p_work_sector, p_company_name,
    p_planned_departure, p_initial_status, p_actual_departure,
    p_employment_start, p_contract_end_date, true
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE FUNCTION app_private.change_placement_status(
  p_placement_id uuid,
  p_expected_status text,
  p_new_status text,
  p_note text,
  p_actual_departure date,
  p_contract_end_date date
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_status text;
  v_school_id uuid;
  v_is_current boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu'
      USING ERRCODE = '42501';
  END IF;
  IF p_note IS NOT NULL AND length(p_note) > 500 THEN
    RAISE EXCEPTION 'Catatan maksimal 500 karakter';
  END IF;
  IF p_actual_departure IS NOT NULL AND p_actual_departure > CURRENT_DATE THEN
    RAISE EXCEPTION 'Tanggal keberangkatan aktual tidak boleh di masa depan';
  END IF;
  IF p_contract_end_date IS NOT NULL AND p_contract_end_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Tanggal selesai kontrak tidak boleh di masa depan';
  END IF;

  -- Lock target row; checking expected status avoids stale UI overwrites.
  SELECT pl.status, a.school_id, pl.is_current
  INTO v_status, v_school_id, v_is_current
  FROM public.placements pl
  JOIN public.alumni a ON a.id = pl.alumni_id
  WHERE pl.id = p_placement_id
  FOR UPDATE OF pl;

  IF NOT FOUND OR NOT app_private.can_write_school(v_school_id) THEN
    RAISE EXCEPTION 'Penempatan tidak ditemukan atau tidak diizinkan'
      USING ERRCODE = '42501';
  END IF;
  IF NOT v_is_current THEN
    RAISE EXCEPTION 'Hanya penempatan terkini yang bisa diubah';
  END IF;
  IF v_status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'Status berubah, muat ulang data terlebih dahulu';
  END IF;
  IF NOT (
    (v_status = 'persiapan_berangkat'
      AND p_new_status IN ('aktif_bekerja', 'batal_berangkat'))
    OR (v_status = 'aktif_bekerja' AND p_new_status = 'selesai_kontrak')
  ) THEN
    RAISE EXCEPTION 'Perubahan status tidak sesuai alur bisnis';
  END IF;
  IF p_new_status <> 'aktif_bekerja' AND p_actual_departure IS NOT NULL THEN
    RAISE EXCEPTION 'Tanggal keberangkatan hanya untuk konfirmasi berangkat';
  END IF;
  IF p_new_status <> 'selesai_kontrak' AND p_contract_end_date IS NOT NULL THEN
    RAISE EXCEPTION 'Tanggal akhir kontrak hanya untuk selesai kontrak';
  END IF;

  -- SET LOCAL-like transaction configuration; read by history trigger.
  PERFORM pg_catalog.set_config('app.status_note', COALESCE(p_note, ''), true);

  UPDATE public.placements
  SET status = p_new_status,
      actual_departure = CASE WHEN p_new_status = 'aktif_bekerja'
        THEN p_actual_departure ELSE actual_departure END,
      contract_end_date = CASE WHEN p_new_status = 'selesai_kontrak'
        THEN p_contract_end_date ELSE contract_end_date END
  WHERE id = p_placement_id;
END;
$$;

-- Authorized users can see the names of status-history actors WITHOUT
-- receiving broad SELECT access to public.profiles.
CREATE FUNCTION app_private.get_status_history(p_placement_id uuid)
RETURNS TABLE (
  id uuid,
  placement_id uuid,
  old_status text,
  new_status text,
  changed_by uuid,
  changed_by_name text,
  note text,
  changed_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT app_private.can_read_placement(p_placement_id) THEN
    RAISE EXCEPTION 'Riwayat tidak ditemukan atau tidak diizinkan'
      USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT h.id, h.placement_id, h.old_status, h.new_status,
         h.changed_by, p.full_name, h.note, h.changed_at
  FROM public.status_histories h
  LEFT JOIN public.profiles p ON p.user_id = h.changed_by
  WHERE h.placement_id = p_placement_id
  ORDER BY h.changed_at ASC, h.id ASC;
END;
$$;

-- RPC wrappers in public are SECURITY INVOKER; elevated code stays private.
CREATE FUNCTION public.create_placement(
  p_alumni_id uuid,
  p_destination_country text,
  p_work_sector text DEFAULT NULL,
  p_company_name text DEFAULT NULL,
  p_planned_departure date DEFAULT NULL,
  p_initial_status text DEFAULT 'persiapan_berangkat',
  p_actual_departure date DEFAULT NULL,
  p_employment_start date DEFAULT NULL,
  p_contract_end_date date DEFAULT NULL
)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_private.create_placement(
    p_alumni_id, p_destination_country, p_work_sector,
    p_company_name, p_planned_departure, p_initial_status,
    p_actual_departure, p_employment_start, p_contract_end_date
  );
$$;

CREATE FUNCTION public.change_placement_status(
  p_placement_id uuid,
  p_expected_status text,
  p_new_status text,
  p_note text DEFAULT NULL,
  p_actual_departure date DEFAULT NULL,
  p_contract_end_date date DEFAULT NULL
)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_private.change_placement_status(
    p_placement_id, p_expected_status, p_new_status, p_note,
    p_actual_departure, p_contract_end_date
  );
$$;

CREATE FUNCTION public.get_status_history(p_placement_id uuid)
RETURNS TABLE (
  id uuid,
  placement_id uuid,
  old_status text,
  new_status text,
  changed_by uuid,
  changed_by_name text,
  note text,
  changed_at timestamptz
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT * FROM app_private.get_status_history(p_placement_id);
$$;

-- 5. ROW LEVEL SECURITY -----------------------------------------------------
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alumni ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_histories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Supabase can auto-grant permissions on tables in public. Remove and
-- re-grant only the required privileges; policies then further restrict rows.
REVOKE ALL ON TABLE public.schools, public.profiles, public.alumni,
  public.placements, public.status_histories, public.audit_logs
  FROM PUBLIC, anon, authenticated;

-- Admin: manage school records and user profiles (no hard delete).
GRANT SELECT, INSERT(npsn, name, city, is_active),
  UPDATE(npsn, name, city, is_active)
  ON public.schools TO authenticated;
GRANT SELECT, INSERT(user_id, full_name, role, school_id, is_active),
  UPDATE(full_name, role, school_id, is_active)
  ON public.profiles TO authenticated;

-- Staff can create/edit/remove own alumni. DELETE fails if FK placements exist
-- to protect employment history. school_id is assigned in a DB trigger.
GRANT SELECT, INSERT(full_name, graduation_year, major),
  UPDATE(full_name, graduation_year, major), DELETE
  ON public.alumni TO authenticated;

-- Staff can only directly edit basic fields of CURRENT placements.
-- Status, actual_departure, contract_end_date, is_current, alumni_id are NOT
-- writable directly, even when the staff can see the row.
GRANT SELECT, UPDATE(destination_country, work_sector, company_name,
  planned_departure, employment_start)
  ON public.placements TO authenticated;
GRANT SELECT ON public.status_histories TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;

CREATE POLICY schools_select ON public.schools FOR SELECT TO authenticated
  USING (app_private.can_read_school(id));
CREATE POLICY schools_insert ON public.schools FOR INSERT TO authenticated
  WITH CHECK ((SELECT app_private.is_admin()));
CREATE POLICY schools_update ON public.schools FOR UPDATE TO authenticated
  USING ((SELECT app_private.is_admin()))
  WITH CHECK ((SELECT app_private.is_admin()));

CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT app_private.is_admin()));
CREATE POLICY profiles_insert ON public.profiles FOR INSERT TO authenticated
  WITH CHECK ((SELECT app_private.is_admin()));
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
  USING ((SELECT app_private.is_admin()))
  WITH CHECK ((SELECT app_private.is_admin()));

CREATE POLICY alumni_select ON public.alumni FOR SELECT TO authenticated
  USING (app_private.can_read_school(school_id));
CREATE POLICY alumni_insert ON public.alumni FOR INSERT TO authenticated
  WITH CHECK (app_private.can_write_school(school_id));
CREATE POLICY alumni_update ON public.alumni FOR UPDATE TO authenticated
  USING (app_private.can_write_school(school_id))
  WITH CHECK (app_private.can_write_school(school_id));
CREATE POLICY alumni_delete ON public.alumni FOR DELETE TO authenticated
  USING (app_private.can_write_school(school_id));

CREATE POLICY placements_select ON public.placements FOR SELECT TO authenticated
  USING (app_private.can_read_alumni(alumni_id));
CREATE POLICY placements_update ON public.placements FOR UPDATE TO authenticated
  USING (is_current = true AND app_private.can_write_alumni(alumni_id))
  WITH CHECK (is_current = true AND app_private.can_write_alumni(alumni_id));

CREATE POLICY status_histories_select ON public.status_histories
  FOR SELECT TO authenticated
  USING (app_private.can_read_placement(placement_id));
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated
  USING ((SELECT app_private.is_admin()));

-- 6. EXECUTE PRIVILEGES -----------------------------------------------------
-- PostgreSQL grants EXECUTE to PUBLIC for newly created functions by default.
-- Restrict every function explicitly, including private helper functions.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app_private
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_placement(uuid,text,text,text,date,text,date,date,date)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.change_placement_status(uuid,text,text,text,date,date)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_status_history(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION app_private.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_read_school(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_write_school(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.current_school_id() TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_read_alumni(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_write_alumni(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_read_placement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.create_placement(uuid,text,text,text,date,text,date,date,date)
  TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.change_placement_status(uuid,text,text,text,date,date)
  TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.get_status_history(uuid)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_placement(uuid,text,text,text,date,text,date,date,date)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_placement_status(uuid,text,text,text,date,date)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_status_history(uuid)
  TO authenticated;

-- There is intentionally NO public trigger for self-signup/profile creation:
-- only Admin Dinas (via an authorized server workflow) assigns roles.
-- First admin must be bootstrapped manually via SQL Editor (see setup guide).
COMMIT;
