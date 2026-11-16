BEGIN;

-- The cross-school page now focuses on paginated student records. Keep the
-- aggregate payload limited to summary cards, distributions, and filter data.
CREATE OR REPLACE FUNCTION public.get_active_student_overview(
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

COMMENT ON FUNCTION public.get_active_student_overview(
  text, uuid, smallint, text, text, integer
) IS
  'Returns RLS-scoped active-student totals, distributions, and filter metadata without per-school monitoring rows.';

COMMIT;
