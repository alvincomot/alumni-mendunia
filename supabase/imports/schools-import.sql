-- psql script, run from this directory after preparing schools.csv from the
-- approved school list. No Auth users, passwords, tokens or emails are created.
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE school_import (
  npsn text PRIMARY KEY CHECK(npsn ~ '^[0-9]{8}$'),
  name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
  city text NOT NULL CHECK(length(btrim(city)) BETWEEN 1 AND 100)
) ON COMMIT DROP;
\copy school_import(npsn,name,city) FROM 'schools.csv' WITH(FORMAT csv,HEADER true,ENCODING 'UTF8')
INSERT INTO public.schools(npsn,name,city,is_active)
SELECT npsn,btrim(name),btrim(city),true FROM school_import
ON CONFLICT(npsn) DO NOTHING;
COMMIT;
