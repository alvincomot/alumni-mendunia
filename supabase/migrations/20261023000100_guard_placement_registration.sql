-- Review and apply explicitly after 20261021000100_initial_schema.sql.
-- No existing data is rewritten. The original implementation remains private.
BEGIN;

CREATE FUNCTION app_private.create_placement_guarded(
  p_alumni_id uuid,
  p_expected_current_id uuid,
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
  v_current_id uuid;
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.alumni a
    WHERE a.id = p_alumni_id AND app_private.can_write_school(a.school_id)
    FOR UPDATE OF a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Alumni unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT id, status INTO v_current_id, v_status FROM public.placements
    WHERE alumni_id = p_alumni_id AND is_current = true FOR UPDATE;
  IF v_current_id IS DISTINCT FROM p_expected_current_id THEN
    RAISE EXCEPTION 'Placement snapshot changed' USING ERRCODE = 'P0001';
  END IF;
  IF v_current_id IS NOT NULL AND v_status NOT IN ('selesai_kontrak', 'batal_berangkat') THEN
    RAISE EXCEPTION 'Current placement must be terminal' USING ERRCODE = 'P0001';
  END IF;
  IF v_current_id IS NULL AND EXISTS (SELECT 1 FROM public.placements WHERE alumni_id = p_alumni_id) THEN
    RAISE EXCEPTION 'Missing current placement requires review' USING ERRCODE = 'P0001';
  END IF;
  RETURN app_private.create_placement(p_alumni_id, p_destination_country,
    p_work_sector, p_company_name, p_planned_departure, p_initial_status,
    p_actual_departure, p_employment_start, p_contract_end_date);
END;
$$;

CREATE FUNCTION public.create_placement_guarded(
  p_alumni_id uuid, p_expected_current_id uuid, p_destination_country text,
  p_work_sector text, p_company_name text, p_planned_departure date,
  p_initial_status text, p_actual_departure date, p_employment_start date,
  p_contract_end_date date
)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_private.create_placement_guarded(p_alumni_id, p_expected_current_id,
    p_destination_country, p_work_sector, p_company_name, p_planned_departure,
    p_initial_status, p_actual_departure, p_employment_start, p_contract_end_date);
$$;

-- Remove the old callable path so clients cannot bypass the terminal/snapshot guards.
REVOKE EXECUTE ON FUNCTION public.create_placement(uuid,text,text,text,date,text,date,date,date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_private.create_placement(uuid,text,text,text,date,text,date,date,date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_placement_guarded(uuid,uuid,text,text,text,date,text,date,date,date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.create_placement_guarded(uuid,uuid,text,text,text,date,text,date,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_placement_guarded(uuid,uuid,text,text,text,date,text,date,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.create_placement_guarded(uuid,uuid,text,text,text,date,text,date,date,date) TO authenticated;

COMMIT;
