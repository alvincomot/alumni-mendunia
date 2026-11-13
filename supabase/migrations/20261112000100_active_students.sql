-- Data Murid Aktif: school-scoped records, accountable status history, and
-- permanent deletion restricted to the authenticated School Staff role.
BEGIN;

CREATE TABLE public.active_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  full_name text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 1 AND 150),
  skill_concentration text NOT NULL
    CHECK (length(btrim(skill_concentration)) BETWEEN 1 AND 150),
  grade smallint NOT NULL CHECK (grade BETWEEN 10 AND 13),
  kjp_status boolean,
  parent_consent boolean NOT NULL CHECK (parent_consent = true),
  parent_consent_at timestamptz NOT NULL,
  parent_consent_by uuid NOT NULL
    REFERENCES public.profiles(user_id) ON DELETE RESTRICT,
  training_status text NOT NULL CHECK (training_status IN (
    'belum_pelatihan', 'aktif_pelatihan', 'selesai_pelatihan'
  )),
  provider_name text
    CHECK (provider_name IS NULL OR length(btrim(provider_name)) BETWEEN 1 AND 200),
  placement_status text NOT NULL CHECK (placement_status IN ('belum', 'sudah')),
  placement_country text
    CHECK (placement_country IS NULL OR length(btrim(placement_country)) BETWEEN 1 AND 100),
  placement_date date,
  data_year smallint NOT NULL CHECK (data_year BETWEEN 2000 AND 2100),
  created_by uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT active_students_placement_fields CHECK (
    (placement_status = 'belum'
      AND placement_country IS NULL
      AND placement_date IS NULL)
    OR
    (placement_status = 'sudah'
      AND placement_country IS NOT NULL
      AND placement_date IS NOT NULL)
  )
);

COMMENT ON TABLE public.active_students IS
  'School-scoped active students interested in overseas work preparation.';
COMMENT ON COLUMN public.active_students.data_year IS
  'Four-digit calendar year when the student was first recorded; immutable after insert.';

CREATE TABLE public.active_student_histories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL
    REFERENCES public.active_students(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  change_type text NOT NULL CHECK (change_type IN (
    'training_status', 'provider_name', 'placement_status',
    'placement_country', 'placement_date'
  )),
  old_value text,
  new_value text,
  changed_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT active_student_history_value_changed CHECK (
    old_value IS DISTINCT FROM new_value
  )
);

CREATE INDEX active_students_school_id_idx
  ON public.active_students(school_id);
CREATE INDEX active_students_data_year_idx
  ON public.active_students(data_year);
CREATE INDEX active_students_grade_idx
  ON public.active_students(grade);
CREATE INDEX active_students_training_status_idx
  ON public.active_students(training_status);
CREATE INDEX active_students_placement_status_idx
  ON public.active_students(placement_status);
CREATE INDEX active_students_school_year_name_idx
  ON public.active_students(school_id, data_year, full_name, id);
CREATE INDEX active_student_histories_student_time_idx
  ON public.active_student_histories(student_id, changed_at, id);
CREATE INDEX active_student_histories_school_id_idx
  ON public.active_student_histories(school_id);

CREATE FUNCTION app_private.prepare_active_student_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school_id uuid;
  v_actor_id uuid;
BEGIN
  v_actor_id := auth.uid();
  v_school_id := app_private.current_school_id();
  IF v_actor_id IS NULL OR v_school_id IS NULL THEN
    RAISE EXCEPTION 'Hanya Petugas Sekolah aktif yang dapat menambah murid'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.parent_consent IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Persetujuan orang tua/wali wajib dikonfirmasi'
      USING ERRCODE = '23514';
  END IF;

  NEW.school_id := v_school_id;
  NEW.parent_consent_at := now();
  NEW.parent_consent_by := v_actor_id;
  NEW.created_by := v_actor_id;
  NEW.updated_by := v_actor_id;
  NEW.created_at := now();
  NEW.updated_at := now();
  IF NEW.placement_status = 'belum' THEN
    NEW.placement_country := NULL;
    NEW.placement_date := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER active_students_prepare_insert
  BEFORE INSERT ON public.active_students FOR EACH ROW
  EXECUTE FUNCTION app_private.prepare_active_student_insert();

CREATE FUNCTION app_private.prepare_active_student_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.school_id IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Data murid tidak boleh dipindahkan ke sekolah lain';
  END IF;
  IF OLD.data_year IS DISTINCT FROM NEW.data_year THEN
    RAISE EXCEPTION 'Tahun Pendataan tidak boleh diubah setelah data dibuat';
  END IF;
  IF OLD.parent_consent IS DISTINCT FROM NEW.parent_consent
    OR OLD.parent_consent_at IS DISTINCT FROM NEW.parent_consent_at
    OR OLD.parent_consent_by IS DISTINCT FROM NEW.parent_consent_by THEN
    RAISE EXCEPTION 'Bukti konfirmasi persetujuan tidak boleh diubah';
  END IF;
  IF OLD.created_by IS DISTINCT FROM NEW.created_by
    OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'Metadata pembuatan tidak boleh diubah';
  END IF;
  IF NOT app_private.can_write_school(OLD.school_id) THEN
    RAISE EXCEPTION 'Perubahan data murid tidak diizinkan'
      USING ERRCODE = '42501';
  END IF;

  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  IF NEW.placement_status = 'belum' THEN
    NEW.placement_country := NULL;
    NEW.placement_date := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER active_students_prepare_update
  BEFORE UPDATE ON public.active_students FOR EACH ROW
  EXECUTE FUNCTION app_private.prepare_active_student_update();

CREATE FUNCTION app_private.record_active_student_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.active_student_histories
      (student_id, school_id, change_type, old_value, new_value, changed_by)
    VALUES
      (NEW.id, NEW.school_id, 'training_status', NULL, NEW.training_status, auth.uid()),
      (NEW.id, NEW.school_id, 'placement_status', NULL, NEW.placement_status, auth.uid());
    IF NEW.provider_name IS NOT NULL THEN
      INSERT INTO public.active_student_histories
        (student_id, school_id, change_type, old_value, new_value, changed_by)
      VALUES (NEW.id, NEW.school_id, 'provider_name', NULL, NEW.provider_name, auth.uid());
    END IF;
    IF NEW.placement_country IS NOT NULL THEN
      INSERT INTO public.active_student_histories
        (student_id, school_id, change_type, old_value, new_value, changed_by)
      VALUES
        (NEW.id, NEW.school_id, 'placement_country', NULL, NEW.placement_country, auth.uid()),
        (NEW.id, NEW.school_id, 'placement_date', NULL, NEW.placement_date::text, auth.uid());
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.training_status IS DISTINCT FROM NEW.training_status THEN
    INSERT INTO public.active_student_histories
      (student_id, school_id, change_type, old_value, new_value, changed_by)
    VALUES (NEW.id, NEW.school_id, 'training_status', OLD.training_status, NEW.training_status, auth.uid());
  END IF;
  IF OLD.provider_name IS DISTINCT FROM NEW.provider_name THEN
    INSERT INTO public.active_student_histories
      (student_id, school_id, change_type, old_value, new_value, changed_by)
    VALUES (NEW.id, NEW.school_id, 'provider_name', OLD.provider_name, NEW.provider_name, auth.uid());
  END IF;
  IF OLD.placement_status IS DISTINCT FROM NEW.placement_status THEN
    INSERT INTO public.active_student_histories
      (student_id, school_id, change_type, old_value, new_value, changed_by)
    VALUES (NEW.id, NEW.school_id, 'placement_status', OLD.placement_status, NEW.placement_status, auth.uid());
  END IF;
  IF OLD.placement_country IS DISTINCT FROM NEW.placement_country THEN
    INSERT INTO public.active_student_histories
      (student_id, school_id, change_type, old_value, new_value, changed_by)
    VALUES (NEW.id, NEW.school_id, 'placement_country', OLD.placement_country, NEW.placement_country, auth.uid());
  END IF;
  IF OLD.placement_date IS DISTINCT FROM NEW.placement_date THEN
    INSERT INTO public.active_student_histories
      (student_id, school_id, change_type, old_value, new_value, changed_by)
    VALUES (NEW.id, NEW.school_id, 'placement_date', OLD.placement_date::text, NEW.placement_date::text, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER active_students_history_insert
  AFTER INSERT ON public.active_students FOR EACH ROW
  EXECUTE FUNCTION app_private.record_active_student_history();
CREATE TRIGGER active_students_history_update
  AFTER UPDATE OF training_status, provider_name, placement_status,
    placement_country, placement_date
  ON public.active_students FOR EACH ROW
  EXECUTE FUNCTION app_private.record_active_student_history();

ALTER TABLE public.audit_logs
  ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE RESTRICT;
ALTER TABLE public.audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_entity_type_check;
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_entity_type_check CHECK (entity_type IN (
    'schools', 'profiles', 'alumni', 'placements', 'active_students'
  ));
CREATE INDEX audit_logs_school_time_idx
  ON public.audit_logs(school_id, occurred_at DESC)
  WHERE school_id IS NOT NULL;

CREATE FUNCTION app_private.record_active_student_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_row public.active_students;
BEGIN
  IF TG_OP = 'UPDATE' AND to_jsonb(OLD) = to_jsonb(NEW) THEN
    RETURN NEW;
  END IF;
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  INSERT INTO public.audit_logs
    (actor_id, action, entity_type, entity_id, school_id)
  VALUES (auth.uid(), TG_OP, 'active_students', v_row.id, v_row.school_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER active_students_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.active_students FOR EACH ROW
  EXECUTE FUNCTION app_private.record_active_student_audit();

CREATE FUNCTION app_private.delete_active_student(p_student_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_student public.active_students;
BEGIN
  SELECT * INTO v_student
  FROM public.active_students
  WHERE id = p_student_id
  FOR UPDATE;
  IF NOT FOUND OR NOT app_private.can_write_school(v_student.school_id) THEN
    RAISE EXCEPTION 'Data murid tidak ditemukan atau tidak diizinkan'
      USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.active_students WHERE id = v_student.id;
  RETURN v_student.id;
END;
$$;

CREATE FUNCTION public.delete_active_student(p_student_id uuid)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_private.delete_active_student(p_student_id);
$$;

CREATE FUNCTION app_private.get_active_student_history(p_student_id uuid)
RETURNS TABLE (
  id uuid,
  student_id uuid,
  change_type text,
  old_value text,
  new_value text,
  changed_by uuid,
  changed_by_name text,
  changed_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school_id uuid;
BEGIN
  SELECT school_id INTO v_school_id
  FROM public.active_students
  WHERE id = p_student_id;
  IF v_school_id IS NULL OR NOT app_private.can_read_school(v_school_id) THEN
    RAISE EXCEPTION 'Riwayat murid tidak ditemukan atau tidak diizinkan'
      USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT h.id, h.student_id, h.change_type, h.old_value, h.new_value,
         h.changed_by, p.full_name, h.changed_at
  FROM public.active_student_histories h
  LEFT JOIN public.profiles p ON p.user_id = h.changed_by
  WHERE h.student_id = p_student_id
  ORDER BY h.changed_at ASC, h.id ASC;
END;
$$;

CREATE FUNCTION public.get_active_student_history(p_student_id uuid)
RETURNS TABLE (
  id uuid,
  student_id uuid,
  change_type text,
  old_value text,
  new_value text,
  changed_by uuid,
  changed_by_name text,
  changed_at timestamptz
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT * FROM app_private.get_active_student_history(p_student_id);
$$;

ALTER TABLE public.active_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_student_histories ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.active_students, public.active_student_histories
  FROM PUBLIC, anon, authenticated;

GRANT SELECT,
  INSERT(full_name, skill_concentration, grade, kjp_status, parent_consent,
    training_status, provider_name, placement_status, placement_country,
    placement_date, data_year),
  UPDATE(full_name, skill_concentration, grade, kjp_status, training_status,
    provider_name, placement_status, placement_country, placement_date)
  ON public.active_students TO authenticated;
GRANT SELECT ON public.active_student_histories TO authenticated;

CREATE POLICY active_students_select ON public.active_students
  FOR SELECT TO authenticated
  USING (app_private.can_read_school(school_id));
CREATE POLICY active_students_insert ON public.active_students
  FOR INSERT TO authenticated
  WITH CHECK (app_private.can_write_school(school_id));
CREATE POLICY active_students_update ON public.active_students
  FOR UPDATE TO authenticated
  USING (app_private.can_write_school(school_id))
  WITH CHECK (app_private.can_write_school(school_id));
CREATE POLICY active_student_histories_select ON public.active_student_histories
  FOR SELECT TO authenticated
  USING (app_private.can_read_school(school_id));

REVOKE EXECUTE ON FUNCTION app_private.prepare_active_student_insert()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_private.prepare_active_student_update()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_private.record_active_student_history()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_private.record_active_student_audit()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_private.delete_active_student(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_private.get_active_student_history(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_active_student(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_active_student_history(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION app_private.delete_active_student(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.get_active_student_history(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_active_student(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_student_history(uuid)
  TO authenticated;

-- Keep the existing privacy-safe pageview aggregate aware of the new fixed
-- route. The old monitoring migration remains untouched and applied systems
-- receive this change only through the forward migration.
ALTER TABLE public.app_pageviews_daily
  DROP CONSTRAINT IF EXISTS app_pageviews_daily_path_check;
ALTER TABLE public.app_pageviews_daily
  ADD CONSTRAINT app_pageviews_daily_path_check CHECK (path IN (
    '/dashboard',
    '/dashboard/alumni',
    '/dashboard/alumni/new',
    '/dashboard/alumni/[id]',
    '/dashboard/murid-aktif',
    '/dashboard/schools',
    '/dashboard/users',
    '/dashboard/reports',
    '/dashboard/monitoring'
  ));

CREATE OR REPLACE FUNCTION public.record_app_pageview(p_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_day date := (statement_timestamp() AT TIME ZONE 'Asia/Jakarta')::date;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = (SELECT auth.uid())
      AND p.is_active = true
      AND (
        p.role IN ('admin_dinas', 'viewer_dinas')
        OR (
          p.role = 'petugas_sekolah'
          AND p.school_id IS NOT NULL
          AND app_private.can_read_school(p.school_id)
        )
      )
  ) THEN
    RAISE EXCEPTION 'Active authenticated profile required'
      USING ERRCODE = '42501';
  END IF;

  IF p_path IS NULL OR p_path NOT IN (
    '/dashboard',
    '/dashboard/alumni',
    '/dashboard/alumni/new',
    '/dashboard/alumni/[id]',
    '/dashboard/murid-aktif',
    '/dashboard/schools',
    '/dashboard/users',
    '/dashboard/reports',
    '/dashboard/monitoring'
  ) THEN
    RAISE EXCEPTION 'Unsupported monitoring path'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.app_pageviews_daily(day, path, view_count, updated_at)
  VALUES (v_day, p_path, 1, statement_timestamp())
  ON CONFLICT (day, path) DO UPDATE
    SET view_count = public.app_pageviews_daily.view_count + 1,
        updated_at = statement_timestamp();
END;
$$;

COMMIT;
