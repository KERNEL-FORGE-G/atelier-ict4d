const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
    "Pragma": "no-cache"
  }
});
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function env(name) {
  try {
    const value = typeof Netlify !== "undefined" ? Netlify.env.get(name) : undefined;
    if (value) return value;
  } catch { /* Fall back to process.env for local compatibility. */ }
  return typeof process !== "undefined" ? process.env[name] : undefined;
}
function text(value) {
  return typeof value === "string" ? value.trim() : "";
}
function publicWorkshop(row) {
  const name = text(row.facilitator_name);
  const rawImagePath = text(row.image_path);
  const imagePath = /^\/assets\/[A-Za-z0-9][A-Za-z0-9._-]{0,200}[.](?:png|jpe?g|webp)$/i.test(rawImagePath)
    ? rawImagePath
    : null;
  const image = typeof row.facilitator_photo_data === "string" &&
    row.facilitator_photo_data.length <= 650_000 &&
    /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(row.facilitator_photo_data)
    ? row.facilitator_photo_data
    : "";
  const profileVisible = Boolean(name && image);
  const duration = Number(row.duration_minutes);
  return {
    slug: text(row.slug),
    registration_code: text(row.registration_code),
    title: text(row.title),
    theme: text(row.theme),
    summary: text(row.summary),
    description: text(row.description),
    duration_minutes: Number.isInteger(duration) && duration > 0 ? duration : null,
    schedule_date: text(row.schedule_date) || null,
    start_time: text(row.start_time) || null,
    end_time: text(row.end_time) || null,
    room: text(row.room) || null,
    image_path: imagePath,
    facilitator_name: profileVisible ? name : null,
    facilitator_role: profileVisible ? text(row.facilitator_role) || null : null,
    facilitator_bio: profileVisible ? text(row.facilitator_bio) || null : null,
    facilitator_photo_data: profileVisible ? image : null
  };
}
export default async (request) => {
  if (request.method !== "GET") return json({ ok: false, message: "Méthode non autorisée." }, 405);
  const query = new URL(request.url).searchParams;
  const rawSlug = query.get("slug");
  const slug = rawSlug === null || rawSlug.trim() === "" ? null : rawSlug.trim().toLowerCase();
  if (slug && (slug.length > 80 || !slugPattern.test(slug))) return json({ ok: false, message: "Identifiant d’atelier invalide." }, 400);
  const supabaseUrl = env("SUPABASE_URL");
  const apiKey = env("SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !apiKey) return json({ ok: false, message: "Le catalogue d’ateliers est momentanément indisponible." }, 503);
  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/public_list_workshops_v3`, {
      method: "POST",
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify({ p_slug: slug })
    });
    if (!response.ok) return json({ ok: false, message: "Le catalogue d’ateliers est momentanément indisponible." }, 503);
    const rows = await response.json();
    if (!Array.isArray(rows)) return json({ ok: false, message: "Réponse du catalogue invalide." }, 502);
    const matchedRows = slug ? rows.filter((row) => text(row?.slug) === slug) : rows;
    const workshops = matchedRows.map(publicWorkshop).filter((workshop) => workshop.slug && workshop.title);
    if (!slug) {
      let visibleProfiles = 0;
      for (const workshop of workshops) {
        if (!workshop.facilitator_photo_data) continue;
        visibleProfiles += 1;
        if (visibleProfiles > 6) {
          workshop.facilitator_name = null;
          workshop.facilitator_role = null;
          workshop.facilitator_bio = null;
          workshop.facilitator_photo_data = null;
        }
      }
    }
    return json({ ok: true, workshops });
  } catch {
    return json({ ok: false, message: "Connexion au catalogue d’ateliers impossible." }, 502);
  }
};
export const config = {
  path: "/api/workshops",
  method: ["GET"],
  rateLimit: { action: "rate_limit", aggregateBy: "ip", windowSize: 60, windowLimit: 60 }
};
