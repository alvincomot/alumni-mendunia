BEGIN;

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
  IF p_new_status = 'selesai_kontrak' AND p_contract_end_date IS NULL THEN
    RAISE EXCEPTION 'Tanggal selesai kontrak wajib diisi';
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

COMMIT;
