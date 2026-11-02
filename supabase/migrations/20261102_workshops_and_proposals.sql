-- ICT4D: proposals and dynamic workshop catalogue.
-- Additive migration: no existing registrations or admin sessions are modified.

create table if not exists public.workshop_proposals (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  created_at timestamp with time zone not null default pg_catalog.now(),
  proposer_name text not null,
  contact_email text not null,
  proposal_type text not null,
  target_workshop_slug text,
  title text not null,
  theme text not null,
  summary text not null,
  duration_minutes integer not null,
  status text not null default 'received',
  consent boolean not null default false,
  admin_notes text,
  constraint workshop_proposals_name_length check (pg_catalog.char_length(pg_catalog.btrim(proposer_name)) between 2 and 120),
  constraint workshop_proposals_email_format check (contact_email = pg_catalog.lower(pg_catalog.btrim(contact_email)) and contact_email ~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9-]+(\.[A-Z0-9-]+)+$'),
  constraint workshop_proposals_type_valid check (proposal_type in ('new', 'improvement')),
  constraint workshop_proposals_target_valid check (proposal_type = 'new' or (target_workshop_slug is not null and pg_catalog.char_length(pg_catalog.btrim(target_workshop_slug)) between 2 and 80)),
  constraint workshop_proposals_title_length check (pg_catalog.char_length(pg_catalog.btrim(title)) between 3 and 140),
  constraint workshop_proposals_theme_length check (pg_catalog.char_length(pg_catalog.btrim(theme)) between 2 and 100),
  constraint workshop_proposals_summary_length check (pg_catalog.char_length(pg_catalog.btrim(summary)) between 20 and 1200),
  constraint workshop_proposals_duration_valid check (duration_minutes between 15 and 600),
  constraint workshop_proposals_status_valid check (status in ('received', 'under_review', 'accepted', 'rejected')),
  constraint workshop_proposals_consent_true check (consent is true)
);

create unique index if not exists workshop_proposals_unique_email_title
  on public.workshop_proposals (pg_catalog.lower(contact_email), pg_catalog.lower(title));
create index if not exists workshop_proposals_status_created_idx
  on public.workshop_proposals (status, created_at desc);

alter table public.workshop_proposals enable row level security;
revoke all on table public.workshop_proposals from public, anon, authenticated;

create table if not exists public.workshops (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  slug text not null unique,
  registration_code text not null unique,
  title text not null,
  theme text not null,
  summary text not null,
  description text not null,
  duration_minutes integer,
  status text not null default 'draft',
  facilitator_name text,
  facilitator_role text,
  facilitator_bio text,
  facilitator_photo_data text,
  facilitator_consent boolean not null default false,
  sort_order integer not null default 100,
  source_proposal_id uuid unique references public.workshop_proposals(id) on delete set null,
  created_at timestamp with time zone not null default pg_catalog.now(),
  updated_at timestamp with time zone not null default pg_catalog.now(),
  constraint workshops_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint workshops_registration_code_format check (registration_code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint workshops_title_length check (pg_catalog.char_length(pg_catalog.btrim(title)) between 3 and 140),
  constraint workshops_theme_length check (pg_catalog.char_length(pg_catalog.btrim(theme)) between 2 and 100),
  constraint workshops_summary_length check (pg_catalog.char_length(pg_catalog.btrim(summary)) between 20 and 1200),
  constraint workshops_description_length check (pg_catalog.char_length(pg_catalog.btrim(description)) between 20 and 6000),
  constraint workshops_duration_valid check (duration_minutes is null or duration_minutes between 15 and 600),
  constraint workshops_status_valid check (status in ('draft', 'published', 'archived')),
  constraint workshops_facilitator_name_length check (facilitator_name is null or pg_catalog.char_length(pg_catalog.btrim(facilitator_name)) <= 120),
  constraint workshops_facilitator_role_length check (facilitator_role is null or pg_catalog.char_length(pg_catalog.btrim(facilitator_role)) <= 120),
  constraint workshops_facilitator_bio_length check (facilitator_bio is null or pg_catalog.char_length(pg_catalog.btrim(facilitator_bio)) <= 600),
  constraint workshops_photo_format check (
    facilitator_photo_data is null
    or (pg_catalog.length(facilitator_photo_data) <= 650000 and facilitator_photo_data like 'data:image/jpeg;base64,%')
  ),
  constraint workshops_photo_needs_consent check (facilitator_photo_data is null or facilitator_consent is true),
  constraint workshops_sort_order_valid check (sort_order between 0 and 10000)
);

create index if not exists workshops_status_order_idx
  on public.workshops (status, sort_order, title);

alter table public.workshops enable row level security;
revoke all on table public.workshops from public, anon, authenticated;

insert into public.workshops (slug, registration_code, title, theme, summary, description, duration_minutes, status, sort_order)
values
  ('ict4d', 'general', 'Numérique et développement', 'Technologies & société',
   'Explorer comment les technologies numériques peuvent contribuer à répondre à des enjeux de développement.',
   'Les outils numériques prennent tout leur sens lorsqu’on les relie aux besoins des personnes et des communautés. Cet atelier propose une porte d’entrée pour questionner ces usages et leurs possibilités.',
   null, 'published', 1),
  ('gdevelop', 'gdevelop', 'Créer un jeu avec GDevelop', 'Création numérique',
   'Imaginer une mécanique, construire un prototype et découvrir les étapes de création d’un jeu vidéo.',
   'La création d’un jeu mêle imagination, logique et expérimentation. Avec GDevelop, découvrez un environnement de création et réfléchissez aux éléments qui donnent forme à une expérience de jeu.',
   null, 'published', 2),
  ('git-github', 'git-github', 'Git et GitHub en équipe', 'Collaboration numérique',
   'Suivre les versions, collaborer et garder une trace claire de l’évolution d’un projet numérique.',
   'À mesure qu’un projet évolue, il est utile de comprendre ce qui a changé, de conserver les étapes et de coordonner le travail. Cet atelier présente Git et GitHub comme des outils de suivi et de collaboration.',
   null, 'published', 3)
on conflict (slug) do nothing;

create or replace function public.admin_list_workshop_proposals(
  p_token text,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  created_at timestamp with time zone,
  proposer_name text,
  contact_email text,
  proposal_type text,
  target_workshop_slug text,
  title text,
  theme text,
  summary text,
  duration_minutes integer,
  status text,
  admin_notes text
)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if p_token is null or not exists (
    select 1 from public.admin_sessions s
    where s.token_hash = pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex')
      and s.expires_at > pg_catalog.now()
  ) then
    raise exception 'Non autorisé' using errcode = '28000';
  end if;
  return query
    select p.id, p.created_at, p.proposer_name, p.contact_email, p.proposal_type,
           p.target_workshop_slug, p.title, p.theme, p.summary, p.duration_minutes,
           p.status, p.admin_notes
      from public.workshop_proposals p
     order by p.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$function$;

create or replace function public.admin_update_workshop_proposal(
  p_token text,
  p_id uuid,
  p_status text,
  p_admin_notes text default null
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if p_token is null or not exists (
    select 1 from public.admin_sessions s
    where s.token_hash = pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex')
      and s.expires_at > pg_catalog.now()
  ) then
    raise exception 'Non autorisé' using errcode = '28000';
  end if;
  if p_status not in ('received', 'under_review', 'accepted', 'rejected') then
    raise exception 'Statut invalide' using errcode = '22023';
  end if;
  update public.workshop_proposals p
     set status = p_status,
         admin_notes = case when p_admin_notes is null then p.admin_notes else pg_catalog.left(pg_catalog.btrim(p_admin_notes), 1000) end
   where p.id = p_id;
  return found;
end;
$function$;

create or replace function public.admin_list_workshops(
  p_token text,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  slug text,
  registration_code text,
  title text,
  theme text,
  summary text,
  description text,
  duration_minutes integer,
  status text,
  facilitator_name text,
  facilitator_role text,
  facilitator_bio text,
  facilitator_photo_data text,
  facilitator_consent boolean,
  sort_order integer,
  source_proposal_id uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if p_token is null or not exists (
    select 1 from public.admin_sessions s
    where s.token_hash = pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex')
      and s.expires_at > pg_catalog.now()
  ) then
    raise exception 'Non autorisé' using errcode = '28000';
  end if;
  return query
    select w.id, w.slug, w.registration_code, w.title, w.theme, w.summary, w.description,
           w.duration_minutes, w.status, w.facilitator_name, w.facilitator_role,
           w.facilitator_bio, w.facilitator_photo_data, w.facilitator_consent,
           w.sort_order, w.source_proposal_id, w.created_at, w.updated_at
      from public.workshops w
     order by w.sort_order, w.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$function$;

create or replace function public.admin_upsert_workshop(
  p_token text,
  p_id uuid,
  p_slug text,
  p_registration_code text,
  p_title text,
  p_theme text,
  p_summary text,
  p_description text,
  p_duration_minutes integer,
  p_status text,
  p_facilitator_name text,
  p_facilitator_role text,
  p_facilitator_bio text,
  p_facilitator_photo_data text,
  p_facilitator_consent boolean,
  p_sort_order integer,
  p_source_proposal_id uuid
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
  v_photo text;
  v_consent boolean := coalesce(p_facilitator_consent, false);
begin
  if p_token is null or not exists (
    select 1 from public.admin_sessions s
    where s.token_hash = pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex')
      and s.expires_at > pg_catalog.now()
  ) then
    raise exception 'Non autorisé' using errcode = '28000';
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Identifiant d’atelier invalide' using errcode = '22023';
  end if;
  if p_registration_code is null or p_registration_code !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Code d’inscription invalide' using errcode = '22023';
  end if;
  if p_status not in ('draft', 'published', 'archived') then
    raise exception 'Statut invalide' using errcode = '22023';
  end if;
  if p_title is null or pg_catalog.char_length(pg_catalog.btrim(p_title)) not between 3 and 140
     or p_theme is null or pg_catalog.char_length(pg_catalog.btrim(p_theme)) not between 2 and 100
     or p_summary is null or pg_catalog.char_length(pg_catalog.btrim(p_summary)) not between 20 and 1200
     or p_description is null or pg_catalog.char_length(pg_catalog.btrim(p_description)) not between 20 and 6000 then
    raise exception 'Informations d’atelier invalides' using errcode = '22023';
  end if;
  if p_duration_minutes is not null and p_duration_minutes not between 15 and 600 then
    raise exception 'Durée invalide' using errcode = '22023';
  end if;
  if p_facilitator_photo_data is not null and (
       pg_catalog.length(p_facilitator_photo_data) > 650000
       or p_facilitator_photo_data not like 'data:image/jpeg;base64,%'
     ) then
    raise exception 'Photo trop volumineuse ou format invalide' using errcode = '22023';
  end if;
  if p_facilitator_photo_data is not null and not v_consent then
    raise exception 'Le consentement explicite est requis pour enregistrer la photo' using errcode = '22023';
  end if;
  if not v_consent and (
       nullif(pg_catalog.btrim(coalesce(p_facilitator_name, '')), '') is not null
       or nullif(pg_catalog.btrim(coalesce(p_facilitator_role, '')), '') is not null
       or nullif(pg_catalog.btrim(coalesce(p_facilitator_bio, '')), '') is not null
       or p_facilitator_photo_data is not null
     ) then
    raise exception 'Le consentement explicite est requis pour enregistrer les informations du chargé d’atelier' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.workshops (
      slug, registration_code, title, theme, summary, description, duration_minutes, status,
      facilitator_name, facilitator_role, facilitator_bio, facilitator_photo_data,
      facilitator_consent, sort_order, source_proposal_id
    ) values (
      pg_catalog.lower(pg_catalog.btrim(p_slug)), pg_catalog.lower(pg_catalog.btrim(p_registration_code)),
      pg_catalog.btrim(p_title), pg_catalog.btrim(p_theme), pg_catalog.btrim(p_summary), pg_catalog.btrim(p_description),
      p_duration_minutes, p_status, nullif(pg_catalog.btrim(coalesce(p_facilitator_name, '')), ''),
      nullif(pg_catalog.btrim(coalesce(p_facilitator_role, '')), ''),
      nullif(pg_catalog.btrim(coalesce(p_facilitator_bio, '')), ''), p_facilitator_photo_data,
      v_consent, greatest(0, least(coalesce(p_sort_order, 100), 10000)), p_source_proposal_id
    ) returning id into v_id;
  else
    update public.workshops w
       set slug = pg_catalog.lower(pg_catalog.btrim(p_slug)),
           registration_code = pg_catalog.lower(pg_catalog.btrim(p_registration_code)),
           title = pg_catalog.btrim(p_title),
           theme = pg_catalog.btrim(p_theme),
           summary = pg_catalog.btrim(p_summary),
           description = pg_catalog.btrim(p_description),
           duration_minutes = p_duration_minutes,
           status = p_status,
           facilitator_name = nullif(pg_catalog.btrim(coalesce(p_facilitator_name, '')), ''),
           facilitator_role = nullif(pg_catalog.btrim(coalesce(p_facilitator_role, '')), ''),
           facilitator_bio = nullif(pg_catalog.btrim(coalesce(p_facilitator_bio, '')), ''),
           facilitator_photo_data = p_facilitator_photo_data,
           facilitator_consent = v_consent,
           sort_order = greatest(0, least(coalesce(p_sort_order, 100), 10000)),
           source_proposal_id = p_source_proposal_id,
           updated_at = pg_catalog.now()
     where w.id = p_id
     returning w.id into v_id;
    if v_id is null then
      raise exception 'Atelier introuvable' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end;
$function$;

create or replace function public.admin_create_workshop_from_proposal(
  p_token text,
  p_proposal_id uuid,
  p_slug text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_proposal public.workshop_proposals%rowtype;
  v_id uuid;
begin
  if p_token is null or not exists (
    select 1 from public.admin_sessions s
    where s.token_hash = pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex')
      and s.expires_at > pg_catalog.now()
  ) then
    raise exception 'Non autorisé' using errcode = '28000';
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Identifiant d’atelier invalide' using errcode = '22023';
  end if;
  select p.* into v_proposal from public.workshop_proposals p where p.id = p_proposal_id;
  if not found then
    raise exception 'Proposition introuvable' using errcode = 'P0002';
  end if;
  select w.id into v_id from public.workshops w where w.source_proposal_id = p_proposal_id;
  if v_id is not null then
    return v_id;
  end if;
  insert into public.workshops (
    slug, registration_code, title, theme, summary, description, duration_minutes,
    status, sort_order, source_proposal_id
  ) values (
    pg_catalog.lower(pg_catalog.btrim(p_slug)), pg_catalog.lower(pg_catalog.btrim(p_slug)),
    v_proposal.title, v_proposal.theme, v_proposal.summary, v_proposal.summary,
    v_proposal.duration_minutes, 'draft', 100, v_proposal.id
  ) returning id into v_id;
  update public.workshop_proposals p set status = 'accepted' where p.id = p_proposal_id;
  return v_id;
end;
$function$;

create or replace function public.public_list_workshops(p_slug text default null)
returns table (
  id uuid,
  slug text,
  registration_code text,
  title text,
  theme text,
  summary text,
  description text,
  duration_minutes integer,
  sort_order integer,
  facilitator_name text,
  facilitator_role text,
  facilitator_bio text,
  facilitator_photo_data text
)
language sql
stable
security definer
set search_path to ''
as $function$
  select w.id, w.slug, w.registration_code, w.title, w.theme, w.summary, w.description,
         w.duration_minutes, w.sort_order,
         case when w.facilitator_consent is true then w.facilitator_name else null end,
         case when w.facilitator_consent is true then w.facilitator_role else null end,
         case when w.facilitator_consent is true then w.facilitator_bio else null end,
         case when w.facilitator_consent is true then w.facilitator_photo_data else null end
    from public.workshops w
   where w.status = 'published'
     and (p_slug is null or w.slug = p_slug)
   order by w.sort_order, w.title
   limit 100;
$function$;

create or replace function public.public_validate_workshop_code(p_code text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1 from public.workshops w
     where w.status = 'published'
       and w.registration_code = p_code
  );
$function$;

create or replace function public.public_submit_workshop_proposal(
  p_proposer_name text,
  p_contact_email text,
  p_proposal_type text,
  p_target_workshop_slug text,
  p_title text,
  p_theme text,
  p_summary text,
  p_duration_minutes integer,
  p_consent boolean
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_target_slug text := null;
begin
  if p_proposer_name is null or pg_catalog.char_length(pg_catalog.btrim(p_proposer_name)) not between 2 and 120 then
    raise exception 'Nom invalide' using errcode = '22023';
  end if;
  if p_contact_email is null
     or pg_catalog.char_length(p_contact_email) > 254
     or p_contact_email <> pg_catalog.lower(pg_catalog.btrim(p_contact_email))
     or p_contact_email !~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9-]+(\.[A-Z0-9-]+)+$' then
    raise exception 'Adresse e-mail invalide' using errcode = '22023';
  end if;
  if p_proposal_type is null or p_proposal_type not in ('new', 'improvement') then
    raise exception 'Type de proposition invalide' using errcode = '22023';
  end if;
  if p_proposal_type = 'improvement' then
    if p_target_workshop_slug is null
       or pg_catalog.char_length(p_target_workshop_slug) > 80
       or p_target_workshop_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      raise exception 'Atelier cible invalide' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.workshops w
      where w.slug = p_target_workshop_slug and w.status = 'published'
    ) then
      raise exception 'Atelier cible indisponible' using errcode = '22023';
    end if;
    v_target_slug := p_target_workshop_slug;
  end if;
  if p_title is null or pg_catalog.char_length(pg_catalog.btrim(p_title)) not between 3 and 140
     or p_theme is null or pg_catalog.char_length(pg_catalog.btrim(p_theme)) not between 2 and 100
     or p_summary is null or pg_catalog.char_length(pg_catalog.btrim(p_summary)) not between 20 and 1200 then
    raise exception 'Contenu de proposition invalide' using errcode = '22023';
  end if;
  if p_duration_minutes is null or p_duration_minutes not between 15 and 600 then
    raise exception 'Durée invalide' using errcode = '22023';
  end if;
  if p_consent is distinct from true then
    raise exception 'Le consentement est requis' using errcode = '22023';
  end if;
  insert into public.workshop_proposals (
    proposer_name, contact_email, proposal_type, target_workshop_slug,
    title, theme, summary, duration_minutes, consent
  ) values (
    pg_catalog.btrim(p_proposer_name), pg_catalog.lower(pg_catalog.btrim(p_contact_email)),
    p_proposal_type, v_target_slug, pg_catalog.btrim(p_title), pg_catalog.btrim(p_theme),
    pg_catalog.btrim(p_summary), p_duration_minutes, true
  );
  return true;
end;
$function$;

revoke all on function public.admin_list_workshop_proposals(text, integer, integer) from public;
revoke all on function public.admin_update_workshop_proposal(text, uuid, text, text) from public;
revoke all on function public.admin_list_workshops(text, integer, integer) from public;
revoke all on function public.admin_upsert_workshop(text, uuid, text, text, text, text, text, text, integer, text, text, text, text, text, boolean, integer, uuid) from public;
revoke all on function public.admin_create_workshop_from_proposal(text, uuid, text) from public;
revoke all on function public.public_list_workshops(text) from public;
revoke all on function public.public_validate_workshop_code(text) from public;
revoke all on function public.public_submit_workshop_proposal(text, text, text, text, text, text, text, integer, boolean) from public;

grant execute on function public.admin_list_workshop_proposals(text, integer, integer) to anon, authenticated;
grant execute on function public.admin_update_workshop_proposal(text, uuid, text, text) to anon, authenticated;
grant execute on function public.admin_list_workshops(text, integer, integer) to anon, authenticated;
grant execute on function public.admin_upsert_workshop(text, uuid, text, text, text, text, text, text, integer, text, text, text, text, text, boolean, integer, uuid) to anon, authenticated;
grant execute on function public.admin_create_workshop_from_proposal(text, uuid, text) to anon, authenticated;
grant execute on function public.public_list_workshops(text) to anon, authenticated;
grant execute on function public.public_validate_workshop_code(text) to anon, authenticated;
grant execute on function public.public_submit_workshop_proposal(text, text, text, text, text, text, text, integer, boolean) to anon, authenticated;
