-- psql script, run from this directory after preparing schools.csv from the
-- approved school list. No Auth users, passwords, tokens or emails are created.
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE school_import (
  npsn text PRIMARY KEY CHECK(npsn ~ '^[0-9]{8}$'),
  name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
  sudin text NOT NULL CHECK(sudin IN (
    'Jakarta Pusat I', 'Jakarta Pusat II',
    'Jakarta Utara I', 'Jakarta Utara II',
    'Jakarta Barat I', 'Jakarta Barat II',
    'Jakarta Selatan I', 'Jakarta Selatan II',
    'Jakarta Timur I', 'Jakarta Timur II',
    'Kepulauan Seribu'
  ))
) ON COMMIT DROP;
\copy school_import(npsn,name,sudin) FROM 'schools.csv' WITH(FORMAT csv,HEADER true,ENCODING 'UTF8')
INSERT INTO public.schools(npsn,name,city,is_active)
SELECT npsn,btrim(name),sudin,true FROM school_import
ON CONFLICT(npsn) DO NOTHING;
COMMIT;
