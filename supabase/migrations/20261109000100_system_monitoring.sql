-- Lightweight, privacy-safe system monitoring for authenticated dashboard use.
-- Pageviews are aggregated by WIB day and normalized path. No user, IP,
-- query string, email, NPSN, token, or alumni identifier is stored.
BEGIN;

CREATE TABLE public.app_pageviews_daily (
  day date NOT NULL,
  path text NOT NULL CHECK (path IN (
    '/dashboard',
    '/dashboard/alumni',
    '/dashboard/alumni/new',
    '/dashboard/alumni/[id]',
    '/dashboard/schools',
    '/dashboard/users',
    '/dashboard/reports',
    '/dashboard/monitoring'
  )),
  view_count bigint NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, path)
);

COMMENT ON TABLE public.app_pageviews_daily IS
  'Daily WIB pageview aggregates for normalized authenticated dashboard paths; retained for 400 days.';

CREATE INDEX audit_logs_actor_time_idx
  ON public.audit_logs(actor_id, occurred_at DESC)
  WHERE actor_id IS NOT NULL;
CREATE INDEX status_histories_changed_at_idx
  ON public.status_histories(changed_at DESC);

ALTER TABLE public.app_pageviews_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_pageviews_daily
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.app_pageviews_daily TO authenticated;

CREATE POLICY app_pageviews_daily_admin_select
  ON public.app_pageviews_daily FOR SELECT TO authenticated
  USING ((SELECT app_private.is_admin()));

CREATE FUNCTION public.record_app_pageview(p_path text)
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

CREATE FUNCTION public.get_system_monitoring_summary(
  p_from date,
  p_to date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today date := (statement_timestamp() AT TIME ZONE 'Asia/Jakarta')::date;
  v_from date := COALESCE(p_from, v_today - 6);
  v_to date := COALESCE(p_to, v_today);
  v_start timestamptz;
  v_end timestamptz;
  v_traffic jsonb;
  v_trend jsonb;
  v_top_paths jsonb;
  v_schools jsonb;
  v_school_activity jsonb;
  v_features jsonb;
  v_confirmations bigint;
BEGIN
  IF app_private.is_admin() IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Active administrator required'
      USING ERRCODE = '42501';
  END IF;
  IF v_from > v_to OR v_to > v_today OR v_to - v_from > 89 THEN
    RAISE EXCEPTION 'Monitoring range must be between 1 and 90 days'
      USING ERRCODE = '22023';
  END IF;

  v_start := v_from::timestamp AT TIME ZONE 'Asia/Jakarta';
  v_end := (v_to + 1)::timestamp AT TIME ZONE 'Asia/Jakarta';

  -- Retention cleanup happens only when an administrator opens monitoring,
  -- not on every pageview write.
  DELETE FROM public.app_pageviews_daily
  WHERE day < v_today - 399;

  SELECT jsonb_build_object(
    'total', COALESCE(sum(view_count), 0),
    'today', COALESCE(sum(view_count) FILTER (WHERE day = v_today), 0),
    'last_7_days', COALESCE(sum(view_count) FILTER (
      WHERE day BETWEEN v_today - 6 AND v_today
    ), 0),
    'last_30_days', COALESCE(sum(view_count) FILTER (
      WHERE day BETWEEN v_today - 29 AND v_today
    ), 0),
    'selected_period', COALESCE(sum(view_count) FILTER (
      WHERE day BETWEEN v_from AND v_to
    ), 0)
  ) INTO v_traffic
  FROM public.app_pageviews_daily;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'day', series.day::date,
    'count', COALESCE(views.count, 0)
  ) ORDER BY series.day), '[]'::jsonb)
  INTO v_trend
  FROM generate_series(v_from, v_to, interval '1 day') AS series(day)
  LEFT JOIN (
    SELECT day, sum(view_count) AS count
    FROM public.app_pageviews_daily
    WHERE day BETWEEN v_from AND v_to
    GROUP BY day
  ) views ON views.day = series.day::date;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'path', ranked.path,
    'count', ranked.count
  ) ORDER BY ranked.count DESC, ranked.path), '[]'::jsonb)
  INTO v_top_paths
  FROM (
    SELECT path, sum(view_count) AS count
    FROM public.app_pageviews_daily
    WHERE day BETWEEN v_from AND v_to
    GROUP BY path
    ORDER BY count DESC, path
    LIMIT 8
  ) ranked;

  v_traffic := v_traffic || jsonb_build_object(
    'trend', v_trend,
    'top_paths', v_top_paths
  );

  SELECT jsonb_build_object(
    'total', count(*),
    'active_accounts', count(*) FILTER (WHERE account.status = 'ACTIVE'),
    'not_activated', count(*) FILTER (
      WHERE account.status IS NULL
        OR account.status IN ('UNCLAIMED', 'PENDING_ACTIVATION')
    ),
    'pending_activation', count(*) FILTER (
      WHERE account.status = 'PENDING_ACTIVATION'
    ),
    'suspended', count(*) FILTER (WHERE account.status = 'SUSPENDED'),
    'activation_percentage', CASE WHEN count(*) = 0 THEN 0
      ELSE round(
        (count(*) FILTER (WHERE account.status = 'ACTIVE'))::numeric
        * 100 / count(*),
        1
      )
    END
  ) INTO v_schools
  FROM public.schools school
  LEFT JOIN app_private.school_auth_accounts account
    ON account.school_id = school.id;

  SELECT jsonb_build_object(
    'schools_with_changes_7_days', count(DISTINCT profile.school_id) FILTER (
      WHERE log.occurred_at >= ((v_today - 6)::timestamp AT TIME ZONE 'Asia/Jakarta')
    ),
    'schools_with_changes_30_days', count(DISTINCT profile.school_id) FILTER (
      WHERE log.occurred_at >= ((v_today - 29)::timestamp AT TIME ZONE 'Asia/Jakarta')
    )
  ) INTO v_school_activity
  FROM public.audit_logs log
  JOIN public.profiles profile ON profile.user_id = log.actor_id
  WHERE profile.school_id IS NOT NULL
    AND log.occurred_at >= ((v_today - 29)::timestamp AT TIME ZONE 'Asia/Jakarta')
    AND log.occurred_at < ((v_today + 1)::timestamp AT TIME ZONE 'Asia/Jakarta');

  SELECT jsonb_build_object(
    'alumni_created', count(*) FILTER (
      WHERE entity_type = 'alumni' AND action = 'INSERT'
    ),
    'alumni_updated', count(*) FILTER (
      WHERE entity_type = 'alumni' AND action = 'UPDATE'
    ),
    'placement_changes', count(*) FILTER (
      WHERE entity_type = 'placements'
    ),
    'school_management', count(*) FILTER (
      WHERE entity_type = 'schools'
    ),
    'user_management', count(*) FILTER (
      WHERE entity_type = 'profiles'
    )
  ) INTO v_features
  FROM public.audit_logs
  WHERE occurred_at >= v_start AND occurred_at < v_end;

  SELECT count(*) INTO v_confirmations
  FROM public.status_histories
  WHERE old_status = 'persiapan_berangkat'
    AND new_status = 'aktif_bekerja'
    AND changed_at >= v_start
    AND changed_at < v_end;

  v_features := v_features || jsonb_build_object(
    'departure_confirmations', v_confirmations
  );

  RETURN jsonb_build_object(
    'generated_at', statement_timestamp(),
    'range', jsonb_build_object('from', v_from, 'to', v_to),
    'traffic', v_traffic,
    'schools', v_schools || v_school_activity,
    'features', v_features
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_app_pageview(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_system_monitoring_summary(date, date)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_app_pageview(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_system_monitoring_summary(date, date)
  TO authenticated;

COMMIT;
