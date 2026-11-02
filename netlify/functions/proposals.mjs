const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
    "Pragma": "no-cache"
  }
});
const emailPattern = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+$/i;
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
function validLength(value, min, max) {
  return value.length >= min && value.length <= max;
}
export default async (request) => {
  if (request.method !== "POST") return json({ ok: false, message: "Méthode non autorisée." }, 405);
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 12_000) return json({ ok: false, message: "La demande est trop volumineuse." }, 413);
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid_body");
  } catch {
    return json({ ok: false, message: "Format de demande invalide." }, 400);
  }
  // Honeypot: bots receive a generic success without storing any data.
  if (typeof body.website === "string" && body.website.trim()) return json({ ok: true }, 201);

  const proposerName = text(body.proposer_name);
  const contactEmail = text(body.contact_email).toLowerCase();
  const proposalType = text(body.proposal_type);
  const title = text(body.title);
  const theme = text(body.theme);
  const summary = text(body.summary);
  const duration = body.duration_minutes;
  const consent = body.consent === true;
  let targetWorkshopSlug = null;

  if (!validLength(proposerName, 2, 120)) return json({ ok: false, message: "Saisissez un nom valide (2 à 120 caractères)." }, 400);
  if (contactEmail.length > 254 || !emailPattern.test(contactEmail)) return json({ ok: false, message: "Saisissez une adresse e-mail valide." }, 400);
  if (!["new", "improvement"].includes(proposalType)) return json({ ok: false, message: "Choisissez le type de proposition." }, 400);
  if (proposalType === "improvement") {
    targetWorkshopSlug = text(body.target_workshop_slug);
    if (targetWorkshopSlug.length > 80 || !slugPattern.test(targetWorkshopSlug)) return json({ ok: false, message: "Choisissez l’atelier à améliorer." }, 400);
  }
  if (!validLength(title, 3, 140)) return json({ ok: false, message: "Le titre doit contenir entre 3 et 140 caractères." }, 400);
  if (!validLength(theme, 2, 100)) return json({ ok: false, message: "Le thème doit contenir entre 2 et 100 caractères." }, 400);
  if (!validLength(summary, 20, 1200)) return json({ ok: false, message: "Le résumé doit contenir entre 20 et 1 200 caractères." }, 400);
  if (!Number.isInteger(duration) || duration < 15 || duration > 600) return json({ ok: false, message: "La durée doit être un nombre entier de 15 à 600 minutes." }, 400);
  if (!consent) return json({ ok: false, message: "Votre accord est nécessaire pour traiter la proposition." }, 400);

  const supabaseUrl = env("SUPABASE_URL");
  const apiKey = env("SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !apiKey) return json({ ok: false, message: "Le service de propositions est momentanément indisponible." }, 503);
  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/public_submit_workshop_proposal`, {
      method: "POST",
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_proposer_name: proposerName,
        p_contact_email: contactEmail,
        p_proposal_type: proposalType,
        p_target_workshop_slug: targetWorkshopSlug,
        p_title: title,
        p_theme: theme,
        p_summary: summary,
        p_duration_minutes: duration,
        p_consent: true
      })
    });
    if (response.status === 409) return json({ ok: false, message: "Une proposition similaire est déjà enregistrée pour cette adresse e-mail." }, 409);
    if (!response.ok) {
      const detail = await response.text();
      if (detail.includes("23505")) return json({ ok: false, message: "Une proposition similaire est déjà enregistrée pour cette adresse e-mail." }, 409);
      if (response.status === 400) return json({ ok: false, message: "Certaines informations ne sont plus valides. Vérifiez le formulaire." }, 400);
      return json({ ok: false, message: "La proposition n’a pas pu être enregistrée. Réessayez." }, 502);
    }
    const result = await response.json().catch(() => false);
    if (result !== true) return json({ ok: false, message: "La proposition n’a pas pu être confirmée. Réessayez." }, 502);
    return json({ ok: true }, 201);
  } catch {
    return json({ ok: false, message: "Connexion au service de propositions impossible." }, 502);
  }
};
export const config = {
  path: "/api/proposals",
  method: ["POST"],
  rateLimit: { action: "rate_limit", aggregateBy: "ip", windowSize: 60, windowLimit: 5 }
};
