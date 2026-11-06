-- Apply before deploying application code that writes placement_secured and
-- placement_provider_name. Existing callable placement functions remain for
-- rolling deployment compatibility and leave new state NULL (unknown).
BEGIN;

ALTER TABLE public.placements
  ADD COLUMN placement_secured boolean,
  ADD COLUMN placement_provider_name text;

COMMENT ON COLUMN public.placements.placement_secured IS
  'TRUE: placement obtained; FALSE: explicitly not obtained; NULL: legacy or unknown.';
COMMENT ON COLUMN public.placements.placement_provider_name IS
  'Verified LPK, Sending Organization, or P3MI intermediary; distinct from legacy company_name employer data.';

-- Active employment and completed contracts prove that a placement existed.
-- Preparation and cancelled historical rows remain unknown rather than being
-- inferred from nullable descriptive fields.
UPDATE public.placements
SET placement_secured = true
WHERE placement_secured IS NULL
  AND status IN ('aktif_bekerja', 'selesai_kontrak');

ALTER TABLE public.placements
  ADD CONSTRAINT placement_provider_name_length CHECK (
    placement_provider_name IS NULL
    OR length(btrim(placement_provider_name)) <= 200
  ),
  ADD CONSTRAINT placement_unsecured_fields_empty CHECK (
    placement_secured IS DISTINCT FROM false
    OR (
      placement_provider_name IS NULL
      AND work_sector IS NULL
      AND planned_departure IS NULL
    )
  ),
  ADD CONSTRAINT placement_secured_status_consistency CHECK (
    placement_secured IS DISTINCT FROM false
    OR status NOT IN ('aktif_bekerja', 'selesai_kontrak')
  );

CREATE INDEX placements_current_secured_idx
  ON public.placements (placement_secured)
  WHERE is_current = true;

CREATE FUNCTION app_private.create_placement_guarded(
  p_alumni_id uuid,
  p_expected_current_id uuid,
  p_destination_country text,
  p_placement_secured boolean,
  p_placement_provider_name text,
  p_work_sector text,
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
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_initial_status IS NULL OR p_initial_status NOT IN (
    'persiapan_berangkat', 'aktif_bekerja', 'selesai_kontrak', 'batal_berangkat'
  ) THEN
    RAISE EXCEPTION 'Status awal penempatan tidak valid';
  END IF;
  IF p_placement_secured IS NULL THEN
    RAISE EXCEPTION 'Status perolehan penempatan wajib diisi';
  END IF;
  IF p_initial_status <> 'persiapan_berangkat'
    AND p_placement_secured IS NOT TRUE THEN
    RAISE EXCEPTION 'Status awal ini harus memiliki penempatan';
  END IF;
  IF p_placement_secured IS FALSE AND (
    p_placement_provider_name IS NOT NULL
    OR p_work_sector IS NOT NULL
    OR p_planned_departure IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Data penempatan harus kosong jika penempatan belum diperoleh';
  END IF;
  IF p_initial_status <> 'persiapan_berangkat'
    AND p_planned_departure IS NOT NULL THEN
    RAISE EXCEPTION 'Rencana keberangkatan hanya untuk persiapan berangkat';
  END IF;
  IF p_initial_status NOT IN ('aktif_bekerja', 'selesai_kontrak')
    AND (p_actual_departure IS NOT NULL OR p_employment_start IS NOT NULL) THEN
    RAISE EXCEPTION 'Tanggal aktual hanya untuk alumni yang sudah bekerja';
  END IF;
  IF p_initial_status <> 'selesai_kontrak'
    AND p_contract_end_date IS NOT NULL THEN
    RAISE EXCEPTION 'Tanggal selesai kontrak hanya untuk status selesai kontrak';
  END IF;
  IF p_actual_departure IS NOT NULL AND p_actual_departure > CURRENT_DATE THEN
    RAISE EXCEPTION 'Tanggal keberangkatan aktual tidak boleh di masa depan';
  END IF;
  IF p_contract_end_date IS NOT NULL AND p_contract_end_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Tanggal selesai kontrak tidak boleh di masa depan';
  END IF;

  PERFORM 1 FROM public.alumni a
  WHERE a.id = p_alumni_id AND app_private.can_write_school(a.school_id)
  FOR UPDATE OF a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Alumni unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT id, status INTO v_current_id, v_status
  FROM public.placements
  WHERE alumni_id = p_alumni_id AND is_current = true
  FOR UPDATE;
  IF v_current_id IS DISTINCT FROM p_expected_current_id THEN
    RAISE EXCEPTION 'Placement snapshot changed' USING ERRCODE = 'P0001';
  END IF;
  IF v_current_id IS NOT NULL
    AND v_status NOT IN ('selesai_kontrak', 'batal_berangkat') THEN
    RAISE EXCEPTION 'Current placement must be terminal' USING ERRCODE = 'P0001';
  END IF;
  IF v_current_id IS NULL AND EXISTS (
    SELECT 1 FROM public.placements WHERE alumni_id = p_alumni_id
  ) THEN
    RAISE EXCEPTION 'Missing current placement requires review' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.placements
  SET is_current = false
  WHERE alumni_id = p_alumni_id AND is_current = true;

  INSERT INTO public.placements (
    alumni_id,
    destination_country,
    placement_secured,
    placement_provider_name,
    work_sector,
    company_name,
    planned_departure,
    status,
    actual_departure,
    employment_start,
    contract_end_date,
    is_current
  ) VALUES (
    p_alumni_id,
    p_destination_country,
    p_placement_secured,
    NULLIF(btrim(p_placement_provider_name), ''),
    NULLIF(btrim(p_work_sector), ''),
    NULL,
    p_planned_departure,
    p_initial_status,
    p_actual_departure,
    p_employment_start,
    p_contract_end_date,
    true
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE FUNCTION public.create_placement_guarded(
  p_alumni_id uuid,
  p_expected_current_id uuid,
  p_destination_country text,
  p_placement_secured boolean,
  p_placement_provider_name text,
  p_work_sector text,
  p_planned_departure date,
  p_initial_status text,
  p_actual_departure date,
  p_employment_start date,
  p_contract_end_date date
)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_private.create_placement_guarded(
    p_alumni_id,
    p_expected_current_id,
    p_destination_country,
    p_placement_secured,
    p_placement_provider_name,
    p_work_sector,
    p_planned_departure,
    p_initial_status,
    p_actual_departure,
    p_employment_start,
    p_contract_end_date
  );
$$;

-- Keep the existing public status RPC signature while enforcing the approved
-- actual-departure requirement and promoting secured state atomically.
CREATE OR REPLACE FUNCTION app_private.change_placement_status(
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
    RAISE EXCEPTION 'Silakan login terlebih dahulu' USING ERRCODE = '42501';
  END IF;
  IF p_note IS NOT NULL AND length(p_note) > 500 THEN
    RAISE EXCEPTION 'Catatan maksimal 500 karakter';
  END IF;
  IF p_new_status = 'aktif_bekerja' AND p_actual_departure IS NULL THEN
    RAISE EXCEPTION 'Tanggal keberangkatan wajib diisi';
  END IF;
  IF p_actual_departure IS NOT NULL AND p_actual_departure > CURRENT_DATE THEN
    RAISE EXCEPTION 'Tanggal keberangkatan aktual tidak boleh di masa depan';
  END IF;
  IF p_contract_end_date IS NOT NULL AND p_contract_end_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Tanggal selesai kontrak tidak boleh di masa depan';
  END IF;

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

  PERFORM pg_catalog.set_config('app.status_note', COALESCE(p_note, ''), true);

  UPDATE public.placements
  SET status = p_new_status,
      placement_secured = CASE
        WHEN p_new_status = 'aktif_bekerja' THEN true
        ELSE placement_secured
      END,
      actual_departure = CASE
        WHEN p_new_status = 'aktif_bekerja' THEN p_actual_departure
        ELSE actual_departure
      END,
      contract_end_date = CASE
        WHEN p_new_status = 'selesai_kontrak' THEN p_contract_end_date
        ELSE contract_end_date
      END
  WHERE id = p_placement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_placement_guarded(
  uuid,uuid,text,boolean,text,text,date,text,date,date,date
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.create_placement_guarded(
  uuid,uuid,text,boolean,text,text,date,text,date,date,date
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_placement_guarded(
  uuid,uuid,text,boolean,text,text,date,text,date,date,date
) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.create_placement_guarded(
  uuid,uuid,text,boolean,text,text,date,text,date,date,date
) TO authenticated;

COMMIT;
