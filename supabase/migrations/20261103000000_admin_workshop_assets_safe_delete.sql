-- ICT4D: local workshop visuals, two additional public workshops, and safe admin deletion.
-- Additive only: existing registrations and their workshop links are preserved.

ALTER TABLE public.workshops
  ADD COLUMN IF NOT EXISTS image_path text;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_constraint
     WHERE conrelid = 'public.workshops'::regclass
       AND conname = 'workshops_image_path_local_asset_check'
  ) THEN
    ALTER TABLE public.workshops
      ADD CONSTRAINT workshops_image_path_local_asset_check
      CHECK (
        image_path IS NULL
        OR image_path ~ '^/assets/[A-Za-z0-9][A-Za-z0-9._-]{0,200}[.](png|jpe?g|webp)$'
      );
  END IF;
END;
$migration$;

UPDATE public.workshops
   SET image_path = CASE slug
     WHEN 'ict4d' THEN '/assets/illustration-general-web.jpg'
     WHEN 'gdevelop' THEN '/assets/illustration-gdevelop-web.jpg'
     WHEN 'git-github' THEN '/assets/illustration-git-github-web.jpg'
     WHEN 'cybersecurite' THEN '/assets/illustration-cybersecurity.jpg'
     WHEN 'developpement-mobile' THEN '/assets/illustration-mobile-development.jpg'
     ELSE image_path
   END
 WHERE image_path IS NULL
   AND slug IN ('ict4d', 'gdevelop', 'git-github', 'cybersecurite', 'developpement-mobile');

INSERT INTO public.workshops (
  slug, registration_code, title, theme, summary, description,
  duration_minutes, status, sort_order, image_path
)
VALUES
  (
    'cybersecurite', 'cybersecurite',
    'Cybersécurité et bons réflexes numériques',
    'Sécurité & hygiène numérique',
    'Apprenez à repérer les risques courants et à adopter des habitudes simples pour mieux protéger vos comptes et vos appareils.',
    'Cet atelier aide à comprendre les risques numériques du quotidien à partir de situations concrètes. Les participantes et participants découvrent des réflexes pour créer et protéger leurs accès, reconnaître les messages suspects, préserver leurs données et adopter une navigation plus sûre. Les exemples servent à développer l’esprit critique et ne remplacent pas un audit de sécurité professionnel.',
    NULL, 'published', 4, '/assets/illustration-cybersecurity.jpg'
  ),
  (
    'developpement-mobile', 'developpement-mobile',
    'Développement mobile : créer une application',
    'Création d’applications mobiles',
    'Découvrez comment une idée devient une expérience mobile utile, en explorant les écrans, les interactions et les premières étapes d’un prototype.',
    'Cet atelier propose une introduction au développement mobile et à la conception d’applications adaptées aux besoins des personnes. Les participantes et participants explorent la structure d’une application, les écrans, les interactions et les étapes qui permettent de passer d’une idée à un prototype. Le contenu détaillé, les outils et la durée seront précisés par l’équipe organisatrice.',
    NULL, 'published', 5, '/assets/illustration-mobile-development.jpg'
  )
ON CONFLICT (slug) DO NOTHING;

CREATE OR REPLACE FUNCTION public.public_list_workshops_v3(p_slug text DEFAULT NULL)
RETURNS TABLE (
  id uuid, slug text, registration_code text, title text, theme text, summary text,
  description text, duration_minutes integer, sort_order integer, facilitator_name text,
  facilitator_role text, facilitator_bio text, facilitator_photo_data text,
  schedule_date date, start_time time without time zone, end_time time without time zone,
  room text, image_path text
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
         w.schedule_date, w.start_time, w.end_time, w.room, w.image_path
    FROM public.workshops w
   WHERE w.status = 'published'
     AND (p_slug IS NULL OR w.slug = p_slug)
   ORDER BY w.sort_order, w.title
   LIMIT 100;
$function$;
REVOKE ALL ON FUNCTION public.public_list_workshops_v3(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_list_workshops_v3(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_workshops_v3(
  p_token text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, slug text, registration_code text, title text, theme text, summary text,
  description text, duration_minutes integer, status text, facilitator_name text,
  facilitator_role text, facilitator_bio text, facilitator_photo_data text,
  facilitator_consent boolean, sort_order integer, source_proposal_id uuid,
  created_at timestamp with time zone, updated_at timestamp with time zone,
  schedule_date date, start_time time without time zone, end_time time without time zone,
  room text, image_path text, registration_count integer
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
    SELECT w.id, w.slug, w.registration_code, w.title, w.theme, w.summary,
           w.description, w.duration_minutes, w.status, w.facilitator_name,
           w.facilitator_role, w.facilitator_bio, w.facilitator_photo_data,
           w.facilitator_consent, w.sort_order, w.source_proposal_id,
           w.created_at, w.updated_at, w.schedule_date, w.start_time,
           w.end_time, w.room, w.image_path,
           (
             SELECT pg_catalog.count(DISTINCT r.id)::integer
               FROM public.registrations r
               LEFT JOIN public.registration_workshops rw ON rw.registration_id = r.id
              WHERE r.workshop = w.registration_code OR rw.workshop_id = w.id
           ) AS registration_count
      FROM public.workshops w
     ORDER BY w.sort_order, w.created_at DESC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_list_workshops_v3(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_workshops_v3(text, integer, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_upsert_workshop_v3(
  p_token text, p_id uuid, p_slug text, p_registration_code text, p_title text,
  p_theme text, p_summary text, p_description text, p_duration_minutes integer,
  p_status text, p_facilitator_name text, p_facilitator_role text,
  p_facilitator_bio text, p_facilitator_photo_data text, p_facilitator_consent boolean,
  p_sort_order integer, p_source_proposal_id uuid, p_schedule_date date,
  p_start_time time without time zone, p_end_time time without time zone,
  p_room text, p_image_path text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_id uuid;
  v_image_path text := NULLIF(pg_catalog.btrim(COALESCE(p_image_path, '')), '');
BEGIN
  IF v_image_path IS NOT NULL
     AND v_image_path !~ '^/assets/[A-Za-z0-9][A-Za-z0-9._-]{0,200}[.](png|jpe?g|webp)$' THEN
    RAISE EXCEPTION 'Le visuel doit pointer vers une image locale autorisée.' USING errcode = '22023';
  END IF;
  v_id := public.admin_upsert_workshop_v2(
    p_token, p_id, p_slug, p_registration_code, p_title, p_theme, p_summary,
    p_description, p_duration_minutes, p_status, p_facilitator_name,
    p_facilitator_role, p_facilitator_bio, p_facilitator_photo_data,
    p_facilitator_consent, p_sort_order, p_source_proposal_id,
    p_schedule_date, p_start_time, p_end_time, p_room
  );
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Atelier introuvable.' USING errcode = '22023';
  END IF;
  UPDATE public.workshops w
     SET image_path = v_image_path,
         updated_at = pg_catalog.now()
   WHERE w.id = v_id;
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_upsert_workshop_v3(text, uuid, text, text, text, text, text, text, integer, text, text, text, text, text, boolean, integer, uuid, date, time without time zone, time without time zone, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_workshop_v3(text, uuid, text, text, text, text, text, text, integer, text, text, text, text, text, boolean, integer, uuid, date, time without time zone, time without time zone, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_workshop(p_token text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_code text;
  v_registration_count integer;
BEGIN
  IF p_token IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.admin_sessions s
     WHERE s.token_hash = pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex')
       AND s.expires_at > pg_catalog.now()
  ) THEN
    RAISE EXCEPTION 'Non autorisé' USING errcode = '28000';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Identifiant d’atelier invalide.' USING errcode = '22023';
  END IF;
  SELECT w.registration_code
    INTO v_code
    FROM public.workshops w
   WHERE w.id = p_id
   FOR UPDATE;
  IF v_code IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('action', 'not_found', 'registration_count', 0);
  END IF;
  SELECT pg_catalog.count(DISTINCT r.id)::integer
    INTO v_registration_count
    FROM public.registrations r
    LEFT JOIN public.registration_workshops rw ON rw.registration_id = r.id
   WHERE r.workshop = v_code OR rw.workshop_id = p_id;
  IF v_registration_count > 0 THEN
    UPDATE public.workshops
       SET status = 'archived', updated_at = pg_catalog.now()
     WHERE id = p_id;
    RETURN pg_catalog.jsonb_build_object('action', 'archived', 'registration_count', v_registration_count);
  END IF;
  BEGIN
    DELETE FROM public.workshops WHERE id = p_id;
  EXCEPTION WHEN foreign_key_violation THEN
    UPDATE public.workshops
       SET status = 'archived', updated_at = pg_catalog.now()
     WHERE id = p_id;
    RETURN pg_catalog.jsonb_build_object('action', 'archived', 'registration_count', 0);
  END;
  RETURN pg_catalog.jsonb_build_object('action', 'deleted', 'registration_count', 0);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_delete_workshop(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_workshop(text, uuid) TO anon, authenticated;
