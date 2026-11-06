BEGIN;

CREATE FUNCTION app_private.update_current_placement_details(
  p_placement_id uuid,
  p_expected_status text,
  p_expected_updated_at timestamptz,
  p_destination_country text,
  p_placement_secured boolean,
  p_placement_provider_name text,
  p_work_sector text,
  p_planned_departure date,
  p_actual_departure date,
  p_employment_start date,
  p_contract_end_date date
)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_placement public.placements%ROWTYPE;
  v_destination_country text;
  v_placement_provider_name text;
  v_work_sector text;
  v_updated_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT pl.*
  INTO v_placement
  FROM public.placements pl
  JOIN public.alumni a ON a.id = pl.alumni_id
  WHERE pl.id = p_placement_id
    AND app_private.can_write_school(a.school_id)
  FOR UPDATE OF pl;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Placement unavailable' USING ERRCODE = '42501';
  END IF;
  IF v_placement.is_current IS NOT TRUE THEN
    RAISE EXCEPTION 'Placement is no longer current' USING ERRCODE = 'P0001';
  END IF;
  IF v_placement.status IS DISTINCT FROM p_expected_status
    OR v_placement.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Placement snapshot changed' USING ERRCODE = 'P0001';
  END IF;

  v_destination_country := btrim(p_destination_country);
  v_placement_provider_name := NULLIF(btrim(p_placement_provider_name), '');
  v_work_sector := NULLIF(btrim(p_work_sector), '');

  IF v_destination_country IS NULL
    OR length(v_destination_country) = 0
    OR length(v_destination_country) > 100 THEN
    RAISE EXCEPTION 'Destination country is invalid';
  END IF;
  IF p_placement_secured IS NULL THEN
    RAISE EXCEPTION 'Placement state is required';
  END IF;
  IF v_placement_provider_name IS NOT NULL
    AND length(v_placement_provider_name) > 200 THEN
    RAISE EXCEPTION 'Placement provider is too long';
  END IF;
  IF v_work_sector IS NOT NULL AND length(v_work_sector) > 150 THEN
    RAISE EXCEPTION 'Work sector is too long';
  END IF;
  IF v_placement.status IN ('aktif_bekerja', 'selesai_kontrak')
    AND p_placement_secured IS NOT TRUE THEN
    RAISE EXCEPTION 'Working placement must remain secured';
  END IF;
  IF p_placement_secured IS FALSE AND (
    v_placement_provider_name IS NOT NULL
    OR v_work_sector IS NOT NULL
    OR p_planned_departure IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Unsecured placement fields must be empty';
  END IF;
  IF v_placement.status NOT IN ('persiapan_berangkat', 'batal_berangkat')
    AND p_planned_departure IS NOT NULL THEN
    RAISE EXCEPTION 'Planned departure does not match current status';
  END IF;
  IF v_placement.status NOT IN ('aktif_bekerja', 'selesai_kontrak')
    AND (p_actual_departure IS NOT NULL OR p_employment_start IS NOT NULL) THEN
    RAISE EXCEPTION 'Working dates do not match current status';
  END IF;
  IF v_placement.status IN ('aktif_bekerja', 'selesai_kontrak')
    AND p_actual_departure IS NULL THEN
    RAISE EXCEPTION 'Actual departure is required for working status';
  END IF;
  IF v_placement.status <> 'selesai_kontrak'
    AND p_contract_end_date IS NOT NULL THEN
    RAISE EXCEPTION 'Contract end date does not match current status';
  END IF;
  IF p_actual_departure IS NOT NULL AND p_actual_departure > CURRENT_DATE THEN
    RAISE EXCEPTION 'Actual departure cannot be in the future';
  END IF;
  IF p_contract_end_date IS NOT NULL AND p_contract_end_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Contract end date cannot be in the future';
  END IF;
  IF p_actual_departure IS NOT NULL AND p_employment_start IS NOT NULL
    AND p_employment_start < p_actual_departure THEN
    RAISE EXCEPTION 'Employment start cannot precede actual departure';
  END IF;
  IF p_contract_end_date IS NOT NULL AND (
    (p_employment_start IS NOT NULL
      AND p_contract_end_date < p_employment_start)
    OR (p_actual_departure IS NOT NULL
      AND p_contract_end_date < p_actual_departure)
  ) THEN
    RAISE EXCEPTION 'Contract end cannot precede departure or employment';
  END IF;

  IF ROW(
    v_placement.destination_country,
    v_placement.placement_secured,
    v_placement.placement_provider_name,
    v_placement.work_sector,
    v_placement.planned_departure,
    v_placement.actual_departure,
    v_placement.employment_start,
    v_placement.contract_end_date
  ) IS NOT DISTINCT FROM ROW(
    v_destination_country,
    p_placement_secured,
    v_placement_provider_name,
    v_work_sector,
    p_planned_departure,
    p_actual_departure,
    p_employment_start,
    p_contract_end_date
  ) THEN
    RETURN v_placement.updated_at;
  END IF;

  UPDATE public.placements
  SET destination_country = v_destination_country,
      placement_secured = p_placement_secured,
      placement_provider_name = v_placement_provider_name,
      work_sector = v_work_sector,
      planned_departure = p_planned_departure,
      actual_departure = p_actual_departure,
      employment_start = p_employment_start,
      contract_end_date = p_contract_end_date
  WHERE id = p_placement_id
  RETURNING updated_at INTO v_updated_at;

  RETURN v_updated_at;
END;
$$;

CREATE FUNCTION public.update_current_placement_details(
  p_placement_id uuid,
  p_expected_status text,
  p_expected_updated_at timestamptz,
  p_destination_country text,
  p_placement_secured boolean,
  p_placement_provider_name text,
  p_work_sector text,
  p_planned_departure date,
  p_actual_departure date,
  p_employment_start date,
  p_contract_end_date date
)
RETURNS timestamptz LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_private.update_current_placement_details(
    p_placement_id,
    p_expected_status,
    p_expected_updated_at,
    p_destination_country,
    p_placement_secured,
    p_placement_provider_name,
    p_work_sector,
    p_planned_departure,
    p_actual_departure,
    p_employment_start,
    p_contract_end_date
  );
$$;

REVOKE ALL ON FUNCTION public.update_current_placement_details(
  uuid,text,timestamptz,text,boolean,text,text,date,date,date,date
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.update_current_placement_details(
  uuid,text,timestamptz,text,boolean,text,text,date,date,date,date
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_current_placement_details(
  uuid,text,timestamptz,text,boolean,text,text,date,date,date,date
) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.update_current_placement_details(
  uuid,text,timestamptz,text,boolean,text,text,date,date,date,date
) TO authenticated;

COMMIT;
