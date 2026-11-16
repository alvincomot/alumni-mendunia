BEGIN;

-- Batch status history reads so an alumni detail page does not execute one
-- RPC for every historical placement. Authorization is checked for every
-- requested placement before any row is returned.
CREATE FUNCTION app_private.get_status_histories(p_placement_ids uuid[])
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_placement_ids IS NULL OR cardinality(p_placement_ids) = 0 THEN
    RETURN;
  END IF;
  IF cardinality(p_placement_ids) > 100 THEN
    RAISE EXCEPTION 'Too many placements requested' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(p_placement_ids) requested(id)
    WHERE NOT app_private.can_read_placement(requested.id)
  ) THEN
    RAISE EXCEPTION 'Riwayat tidak ditemukan atau tidak diizinkan'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT history.id, history.placement_id, history.old_status,
         history.new_status, history.changed_by, profile.full_name,
         history.note, history.changed_at
  FROM public.status_histories history
  LEFT JOIN public.profiles profile ON profile.user_id = history.changed_by
  WHERE history.placement_id = ANY(p_placement_ids)
  ORDER BY history.placement_id, history.changed_at, history.id;
END;
$$;

CREATE FUNCTION public.get_status_histories(p_placement_ids uuid[])
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
  SELECT * FROM app_private.get_status_histories(p_placement_ids);
$$;

-- Admin-only batch lookup for the visible school page. This replaces up to
-- ten independent school_auth_lookup calls with one authorized RPC.
CREATE FUNCTION app_private.get_school_auth_statuses(p_school_ids uuid[])
RETURNS TABLE (school_id uuid, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF app_private.is_admin() IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Active administrator required' USING ERRCODE = '42501';
  END IF;
  IF p_school_ids IS NULL OR cardinality(p_school_ids) = 0 THEN
    RETURN;
  END IF;
  IF cardinality(p_school_ids) > 100 THEN
    RAISE EXCEPTION 'Too many schools requested' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT requested.id, account.status::text
  FROM unnest(p_school_ids) requested(id)
  JOIN public.schools school ON school.id = requested.id
  LEFT JOIN app_private.school_auth_accounts account
    ON account.school_id = school.id;
END;
$$;

CREATE FUNCTION public.get_school_auth_statuses(p_school_ids uuid[])
RETURNS TABLE (school_id uuid, status text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT * FROM app_private.get_school_auth_statuses(p_school_ids);
$$;

-- The active-student list remains RLS-scoped because this aggregate runs as
-- the caller. It returns summary, distribution, and filter metadata in one
-- database round trip while the visible rows use a separate paginated query.
CREATE FUNCTION public.get_active_student_overview(
  p_search text DEFAULT NULL,
  p_school_id uuid DEFAULT NULL,
  p_grade smallint DEFAULT NULL,
  p_training_status text DEFAULT NULL,
  p_placement_status text DEFAULT NULL,
  p_data_year integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH scoped AS MATERIALIZED (
    SELECT student.school_id, student.full_name, student.grade,
           student.training_status, student.placement_status,
           student.data_year, school.name AS school_name,
           school.npsn AS school_npsn
    FROM public.active_students student
    JOIN public.schools school ON school.id = student.school_id
  ),
  filtered AS MATERIALIZED (
    SELECT *
    FROM scoped
    WHERE (NULLIF(btrim(p_search), '') IS NULL
           OR strpos(lower(full_name), lower(btrim(p_search))) > 0)
      AND (p_school_id IS NULL OR school_id = p_school_id)
      AND (p_grade IS NULL OR grade = p_grade)
      AND (p_training_status IS NULL
           OR training_status = p_training_status)
      AND (p_placement_status IS NULL
           OR placement_status = p_placement_status)
      AND (p_data_year IS NULL OR data_year = p_data_year)
  ),
  school_groups AS (
    SELECT school_id, school_name, school_npsn, count(*) AS total,
           count(*) FILTER (
             WHERE training_status = 'aktif_pelatihan'
           ) AS active_training,
           count(*) FILTER (
             WHERE training_status = 'selesai_pelatihan'
           ) AS completed_training,
           count(*) FILTER (
             WHERE placement_status = 'sudah'
           ) AS placed
    FROM filtered
    GROUP BY school_id, school_name, school_npsn
  ),
  filter_schools AS (
    SELECT DISTINCT school_id, school_name, school_npsn
    FROM scoped
  ),
  filter_years AS (
    SELECT DISTINCT data_year
    FROM scoped
  )
  SELECT jsonb_build_object(
    'total', count(*),
    'placed', count(*) FILTER (WHERE placement_status = 'sudah'),
    'school_count', count(DISTINCT school_id),
    'training', jsonb_build_object(
      'belum_pelatihan', count(*) FILTER (
        WHERE training_status = 'belum_pelatihan'
      ),
      'aktif_pelatihan', count(*) FILTER (
        WHERE training_status = 'aktif_pelatihan'
      ),
      'selesai_pelatihan', count(*) FILTER (
        WHERE training_status = 'selesai_pelatihan'
      )
    ),
    'grades', jsonb_build_object(
      '10', count(*) FILTER (WHERE grade = 10),
      '11', count(*) FILTER (WHERE grade = 11),
      '12', count(*) FILTER (WHERE grade = 12),
      '13', count(*) FILTER (WHERE grade = 13)
    ),
    'by_school', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', school_id,
        'name', school_name,
        'npsn', school_npsn,
        'total', total,
        'active_training', active_training,
        'completed_training', completed_training,
        'placed', placed
      ) ORDER BY total DESC, school_name, school_id)
      FROM school_groups
    ), '[]'::jsonb),
    'filter_schools', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', school_id,
        'name', school_name,
        'npsn', school_npsn
      ) ORDER BY school_name, school_id)
      FROM filter_schools
    ), '[]'::jsonb),
    'filter_years', COALESCE((
      SELECT jsonb_agg(data_year ORDER BY data_year DESC)
      FROM filter_years
    ), '[]'::jsonb)
  )
  FROM filtered;
$$;

REVOKE EXECUTE ON FUNCTION app_private.get_status_histories(uuid[]),
  app_private.get_school_auth_statuses(uuid[])
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_status_histories(uuid[]),
  public.get_school_auth_statuses(uuid[]),
  public.get_active_student_overview(text,uuid,smallint,text,text,integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION app_private.get_status_histories(uuid[]),
  app_private.get_school_auth_statuses(uuid[])
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_status_histories(uuid[]),
  public.get_school_auth_statuses(uuid[]),
  public.get_active_student_overview(text,uuid,smallint,text,text,integer)
  TO authenticated;

COMMIT;
