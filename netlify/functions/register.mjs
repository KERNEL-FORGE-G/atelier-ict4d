const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, max-age=0", "Pragma": "no-cache" }
});
const emailPattern = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+$/i;
const allowedLevels = new Set(["L1", "L2", "L3"]);
const workshopPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function env(name) {
  try {
    const value = typeof Netlify !== "undefined" ? Netlify.env.get(name) : undefined;
    if (value) return value;
  } catch { /* Compatibility with local environments. */ }
  return typeof process !== "undefined" ? process.env[name] : undefined;
}
async function callRpc(supabaseUrl, apiKey, args) {
  return fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/public_submit_registration`, {
    method: "POST",
    headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(args)
  });
}
export default async (request) => {
  if (request.method !== "POST") return json({ ok: false, message: "Méthode non autorisée." }, 405);
  const supabaseUrl = env("SUPABASE_URL");
  const apiKey = env("SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !apiKey) return json({ ok: false, message: "Le service d’inscription est momentanément indisponible." }, 503);
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 12000) return json({ ok: false, message: "La demande est trop volumineuse." }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, message: "Format de demande invalide." }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, message: "Format de demande invalide." }, 400);
  // Honeypot: appear successful to simple bots without inserting their data.
  if (typeof body.website === "string" && body.website.trim()) return json({ ok: true }, 201);
  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const level = typeof body.level === "string" ? body.level : "";
  const consent = body.consent === true;
  const inputCodes = Array.isArray(body.workshops) ? body.workshops : (typeof body.workshop === "string" ? [body.workshop] : null);
  if (fullName.length < 2 || fullName.length > 120) return json({ ok: false, message: "Saisissez un nom complet valide." }, 400);
  if (email.length > 254 || !emailPattern.test(email)) return json({ ok: false, message: "Saisissez une adresse e-mail valide." }, 400);
  if (!allowedLevels.has(level)) return json({ ok: false, message: "Choisissez votre niveau d’étude." }, 400);
  if (!consent) return json({ ok: false, message: "Votre accord est nécessaire pour traiter la préinscription." }, 400);
  if (!inputCodes || inputCodes.length < 1 || inputCodes.length > 12) {
    return json({ ok: false, reason: "invalid_selection", message: "Choisissez au moins un atelier." }, 400);
  }
  const workshops = inputCodes.map((value) => typeof value === "string" ? value.trim() : "");
  if (new Set(workshops).size !== workshops.length || workshops.some((code) => code.length > 100 || !workshopPattern.test(code))) {
    return json({ ok: false, reason: "invalid_selection", message: "Choisissez un ou plusieurs ateliers publiés." }, 400);
  }
  try {
    const response = await callRpc(supabaseUrl, apiKey, {
      p_full_name: fullName,
      p_email: email,
      p_level: level,
      p_workshop_codes: workshops,
      p_consent: consent
    });
    if (!response.ok) return json({ ok: false, message: "L’inscription n’a pas pu être enregistrée. Réessayez." }, 502);
    let result;
    try { result = await response.json(); } catch { return json({ ok: false, message: "Réponse du service d’inscription invalide." }, 502); }
    const status = result?.status;
    if (status === "success") return json({ ok: true }, 201);
    if (status === "duplicate") return json({ ok: false, reason: "duplicate", message: "Une préinscription existe déjà pour cette adresse e-mail." }, 409);
    const messages = {
      invalid_profile: "Vérifiez votre nom, votre e-mail, votre niveau et votre accord.",
      invalid_selection: "Choisissez un ou plusieurs ateliers publiés.",
      unknown_workshop: "Un atelier sélectionné n’est plus disponible. Actualisez la page puis réessayez.",
      schedule_missing: "Plusieurs ateliers ne peuvent être combinés tant que tous leurs horaires ne sont pas confirmés.",
      schedule_conflict: "Deux ateliers sélectionnés se chevauchent. Choisissez un seul atelier pour ce créneau."
    };
    if (messages[status]) return json({ ok: false, reason: status, message: messages[status] }, 400);
    return json({ ok: false, message: "L’inscription n’a pas pu être enregistrée. Réessayez." }, 502);
  } catch {
    return json({ ok: false, message: "Connexion au service d’inscription impossible." }, 502);
  }
};
export const config = {
  path: "/api/register",
  method: ["POST"],
  rateLimit: { action: "rate_limit", aggregateBy: "ip", windowSize: 60, windowLimit: 10 }
};
