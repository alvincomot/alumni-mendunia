-- Require complete active-student records for all future writes while keeping
-- existing prototype rows readable until they are corrected through the UI.
BEGIN;

ALTER TABLE public.active_students
  ADD CONSTRAINT active_students_kjp_status_required
  CHECK (kjp_status IS NOT NULL) NOT VALID;

ALTER TABLE public.active_students
  ADD CONSTRAINT active_students_provider_name_required
  CHECK (
    provider_name IS NOT NULL
    AND length(btrim(provider_name)) BETWEEN 1 AND 200
  ) NOT VALID;

-- Qualify table columns so PL/pgSQL does not confuse the returned `id` field
-- with active_students.id when this RPC executes.
CREATE OR REPLACE FUNCTION app_private.get_active_student_history(p_student_id uuid)
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
  SELECT student.school_id INTO v_school_id
  FROM public.active_students AS student
  WHERE student.id = p_student_id;

  IF v_school_id IS NULL OR NOT app_private.can_read_school(v_school_id) THEN
    RAISE EXCEPTION 'Riwayat murid tidak ditemukan atau tidak diizinkan'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT history.id, history.student_id, history.change_type,
         history.old_value, history.new_value, history.changed_by,
         profile.full_name, history.changed_at
  FROM public.active_student_histories AS history
  LEFT JOIN public.profiles AS profile ON profile.user_id = history.changed_by
  WHERE history.student_id = p_student_id
  ORDER BY history.changed_at ASC, history.id ASC;
END;
$$;

COMMIT;
