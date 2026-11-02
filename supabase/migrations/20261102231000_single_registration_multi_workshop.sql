-- Une fiche par personne, associée à un ou plusieurs ateliers sans chevauchement.
-- Aucun horaire, aucune salle et aucun tarif ne sont préremplis.

LOCK TABLE public.registrations IN SHARE ROW EXCLUSIVE MODE;

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.registrations
     GROUP BY lower(email)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Migration arrêtée : plusieurs fiches partagent une adresse e-mail; fusion manuelle requise.';
  END IF;
END;
$migration$;

ALTER TABLE public.workshops
  ADD COLUMN IF NOT EXISTS schedule_date date,
  ADD COLUMN IF NOT EXISTS start_time time without time zone,
  ADD COLUMN IF NOT EXISTS end_time time without time zone,
  ADD COLUMN IF NOT EXISTS room text;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.workshops'::regclass
       AND conname = 'workshops_schedule_complete_check'
  ) THEN
    ALTER TABLE public.workshops
      ADD CONSTRAINT workshops_schedule_complete_check
      CHECK (
        (schedule_date IS NULL AND start_time IS NULL AND end_time IS NULL)
        OR
        (schedule_date IS NOT NULL AND start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time)
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.workshops'::regclass
       AND conname = 'workshops_room_length_check'
  ) THEN
    ALTER TABLE public.workshops
      ADD CONSTRAINT workshops_room_length_check
      CHECK (room IS NULL OR char_length(btrim(room)) <= 160);
  END IF;
END;
$migration$;

CREATE TABLE IF NOT EXISTS public.registration_workshops (
  registration_id uuid NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  workshop_id uuid NOT NULL REFERENCES public.workshops(id) ON DELETE RESTRICT,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (registration_id, workshop_id)
);
CREATE INDEX IF NOT EXISTS registration_workshops_workshop_id_idx
  ON public.registration_workshops (workshop_id, registration_id);
ALTER TABLE public.registration_workshops ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.registration_workshops FROM PUBLIC, anon, authenticated;

-- Relie les fiches déjà présentes. Le schéma observé a quatre fiches et toutes ont un atelier correspondant.
INSERT INTO public.registration_workshops (registration_id, workshop_id)
SELECT r.id, w.id
  FROM public.registrations r
  JOIN public.workshops w ON w.registration_code = r.workshop
ON CONFLICT (registration_id, workshop_id) DO NOTHING;

-- Conserve le champ historique `workshop` comme atelier principal pour les anciens clients,
-- tout en permettant les nouveaux codes d’ateliers publiés.
ALTER TABLE public.registrations DROP CONSTRAINT IF EXISTS registrations_workshop_check;
ALTER TABLE public.registrations
  ADD CONSTRAINT registrations_workshop_check
  CHECK (workshop ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

DROP INDEX IF EXISTS public.registrations_email_workshop_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS registrations_email_unique_idx
  ON public.registrations (lower(email));

-- Compatibilité transitoire : un ancien client qui envoie encore un atelier unique
-- alimente aussi la table de liaison pendant le déploiement du nouveau site.
CREATE OR REPLACE FUNCTION public.link_primary_registration_workshop()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.registration_workshops (registration_id, workshop_id)
  SELECT NEW.id, w.id
    FROM public.workshops w
   WHERE w.registration_code = NEW.workshop
  ON CONFLICT (registration_id, workshop_id) DO NOTHING;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.link_primary_registration_workshop() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS registrations_link_primary_workshop ON public.registrations;
CREATE TRIGGER registrations_link_primary_workshop
AFTER INSERT ON public.registrations
FOR EACH ROW EXECUTE FUNCTION public.link_primary_registration_workshop();

CREATE OR REPLACE FUNCTION public.public_list_workshops_v2(p_slug text DEFAULT NULL)
RETURNS TABLE (
  id uuid, slug text, registration_code text, title text, theme text, summary text,
  description text, duration_minutes integer, sort_order integer, facilitator_name text,
  facilitator_role text, facilitator_bio text, facilitator_photo_data text,
  schedule_date date, start_time time without time zone, end_time time without time zone, room text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT w.id, w.slug, w.registration_code, w.title, w.theme, w.summary, w.description,
         w.duration_minutes, w.sort_order,
         CASE WHEN w.facilitator_consent IS TRUE THEN w.facilitator_name ELSE NULL END,
         CASE WHEN w.facilitator_consent IS TRUE THEN w.facilitator_role ELSE NULL END,
         CASE WHEN w.facilitator_consent IS TRUE THEN w.facilitator_bio ELSE NULL END,
         CASE WHEN w.facilitator_consent IS TRUE THEN w.facilitator_photo_data ELSE NULL END,
         w.schedule_date, w.start_time, w.end_time, w.room
    FROM public.workshops w
   WHERE w.status = 'published'
     AND (p_slug IS NULL OR w.slug = p_slug)
   ORDER BY w.sort_order, w.title
   LIMIT 100;
$function$;
REVOKE ALL ON FUNCTION public.public_list_workshops_v2(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_list_workshops_v2(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_workshops_v2(
  p_token text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, slug text, registration_code text, title text, theme text, summary text,
  description text, duration_minutes integer, status text, facilitator_name text,
  facilitator_role text, facilitator_bio text, facilitator_photo_data text,
  facilitator_consent boolean, sort_order integer, source_proposal_id uuid,
  created_at timestamp with time zone, updated_at timestamp with time zone,
  schedule_date date, start_time time without time zone, end_time time without time zone, room text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF p_token IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.admin_sessions s
     WHERE s.token_hash = pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex')
       AND s.expires_at > pg_catalog.now()
  ) THEN
    RAISE EXCEPTION 'Non autorisé' USING errcode = '28000';
  END IF;
  RETURN QUERY
    SELECT w.id, w.slug, w.registration_code, w.title, w.theme, w.summary, w.description,
           w.duration_minutes, w.status, w.facilitator_name, w.facilitator_role,
           w.facilitator_bio, w.facilitator_photo_data, w.facilitator_consent,
           w.sort_order, w.source_proposal_id, w.created_at, w.updated_at,
           w.schedule_date, w.start_time, w.end_time, w.room
      FROM public.workshops w
     ORDER BY w.sort_order, w.created_at DESC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_list_workshops_v2(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_workshops_v2(text, integer, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_registrations_v2(
  p_token text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, created_at timestamp with time zone, full_name text, email text,
  level text, workshop text, status text, admin_notes text, workshops text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF p_token IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.admin_sessions s
     WHERE s.token_hash = pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex')
       AND s.expires_at > pg_catalog.now()
  ) THEN
    RAISE EXCEPTION 'Non autorisé' USING errcode = '28000';
  END IF;
  RETURN QUERY
    SELECT r.id, r.created_at, r.full_name, r.email, r.level, r.workshop,
           r.status, r.admin_notes,
           COALESCE(
             ARRAY(
               SELECT w.registration_code
                 FROM public.registration_workshops rw
                 JOIN public.workshops w ON w.id = rw.workshop_id
                WHERE rw.registration_id = r.id
                ORDER BY w.sort_order, w.title
             ),
             ARRAY[]::text[]
           )
      FROM public.registrations r
     ORDER BY r.created_at DESC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_list_registrations_v2(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_registrations_v2(text, integer, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_upsert_workshop_v2(
  p_token text, p_id uuid, p_slug text, p_registration_code text, p_title text,
  p_theme text, p_summary text, p_description text, p_duration_minutes integer,
  p_status text, p_facilitator_name text, p_facilitator_role text,
  p_facilitator_bio text, p_facilitator_photo_data text, p_facilitator_consent boolean,
  p_sort_order integer, p_source_proposal_id uuid, p_schedule_date date,
  p_start_time time without time zone, p_end_time time without time zone, p_room text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_id uuid;
  v_schedule_complete boolean;
BEGIN
  v_schedule_complete :=
    (p_schedule_date IS NULL AND p_start_time IS NULL AND p_end_time IS NULL)
    OR
    (p_schedule_date IS NOT NULL AND p_start_time IS NOT NULL AND p_end_time IS NOT NULL AND p_start_time < p_end_time);
  IF NOT v_schedule_complete THEN
    RAISE EXCEPTION 'La date, les heures de début et de fin doivent être complètes; la fin doit suivre le début.' USING errcode = '22023';
  END IF;
  IF p_room IS NOT NULL AND pg_catalog.char_length(pg_catalog.btrim(p_room)) > 160 THEN
    RAISE EXCEPTION 'Le nom de salle est trop long.' USING errcode = '22023';
  END IF;
  v_id := public.admin_upsert_workshop(
    p_token, p_id, p_slug, p_registration_code, p_title, p_theme, p_summary,
    p_description, p_duration_minutes, p_status, p_facilitator_name,
    p_facilitator_role, p_facilitator_bio, p_facilitator_photo_data,
    p_facilitator_consent, p_sort_order, p_source_proposal_id
  );
  UPDATE public.workshops w
     SET schedule_date = p_schedule_date,
         start_time = p_start_time,
         end_time = p_end_time,
         room = NULLIF(pg_catalog.btrim(COALESCE(p_room, '')), ''),
         updated_at = pg_catalog.now()
   WHERE w.id = v_id;
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_upsert_workshop_v2(text, uuid, text, text, text, text, text, text, integer, text, text, text, text, text, boolean, integer, uuid, date, time without time zone, time without time zone, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_workshop_v2(text, uuid, text, text, text, text, text, text, integer, text, text, text, text, text, boolean, integer, uuid, date, time without time zone, time without time zone, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_submit_registration(
  p_full_name text, p_email text, p_level text, p_workshop_codes text[], p_consent boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_registration_id uuid;
  v_distinct_count integer;
BEGIN
  IF p_full_name IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_full_name)) NOT BETWEEN 2 AND 120
     OR p_email IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_email)) NOT BETWEEN 5 AND 254
     OR pg_catalog.lower(pg_catalog.btrim(p_email)) !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$'
     OR p_level IS NULL OR p_level NOT IN ('L1', 'L2', 'L3') OR p_consent IS DISTINCT FROM TRUE THEN
    RETURN pg_catalog.jsonb_build_object('status', 'invalid_profile');
  END IF;
  IF p_workshop_codes IS NULL OR pg_catalog.cardinality(p_workshop_codes) < 1 OR pg_catalog.cardinality(p_workshop_codes) > 12 THEN
    RETURN pg_catalog.jsonb_build_object('status', 'invalid_selection');
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.unnest(p_workshop_codes) AS x(code)
     WHERE x.code IS NULL OR x.code !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR pg_catalog.char_length(x.code) > 100
  ) THEN
    RETURN pg_catalog.jsonb_build_object('status', 'invalid_selection');
  END IF;
  SELECT pg_catalog.count(DISTINCT x.code) INTO v_distinct_count
    FROM pg_catalog.unnest(p_workshop_codes) AS x(code);
  IF v_distinct_count <> pg_catalog.cardinality(p_workshop_codes) THEN
    RETURN pg_catalog.jsonb_build_object('status', 'invalid_selection');
  END IF;
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.unnest(p_workshop_codes) AS x(code)
      LEFT JOIN public.workshops w ON w.registration_code = x.code AND w.status = 'published'
     WHERE w.id IS NULL
  ) THEN
    RETURN pg_catalog.jsonb_build_object('status', 'unknown_workshop');
  END IF;
  IF pg_catalog.cardinality(p_workshop_codes) > 1 THEN
    IF EXISTS (
      SELECT 1 FROM public.workshops w
       WHERE w.registration_code = ANY(p_workshop_codes)
         AND (w.schedule_date IS NULL OR w.start_time IS NULL OR w.end_time IS NULL)
    ) THEN
      RETURN pg_catalog.jsonb_build_object('status', 'schedule_missing');
    END IF;
    IF EXISTS (
      SELECT 1
        FROM public.workshops a
        JOIN public.workshops b ON a.id < b.id
       WHERE a.registration_code = ANY(p_workshop_codes)
         AND b.registration_code = ANY(p_workshop_codes)
         AND a.status = 'published' AND b.status = 'published'
         AND a.schedule_date + a.start_time < b.schedule_date + b.end_time
         AND a.schedule_date + a.end_time > b.schedule_date + b.start_time
    ) THEN
      RETURN pg_catalog.jsonb_build_object('status', 'schedule_conflict');
    END IF;
  END IF;
  INSERT INTO public.registrations (full_name, email, level, workshop, consent)
  VALUES (
    pg_catalog.btrim(p_full_name),
    pg_catalog.lower(pg_catalog.btrim(p_email)),
    p_level,
    p_workshop_codes[1],
    TRUE
  )
  RETURNING id INTO v_registration_id;
  INSERT INTO public.registration_workshops (registration_id, workshop_id)
  SELECT v_registration_id, w.id
    FROM public.workshops w
   WHERE w.registration_code = ANY(p_workshop_codes)
  ON CONFLICT (registration_id, workshop_id) DO NOTHING;
  RETURN pg_catalog.jsonb_build_object('status', 'success');
EXCEPTION
  WHEN unique_violation THEN
    RETURN pg_catalog.jsonb_build_object('status', 'duplicate');
END;
$function$;
REVOKE ALL ON FUNCTION public.public_submit_registration(text, text, text, text[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_submit_registration(text, text, text, text[], boolean) TO anon, authenticated;
