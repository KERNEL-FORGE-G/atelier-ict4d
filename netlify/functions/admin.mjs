const COOKIE_NAME = "ict4d_admin_session";
const SESSION_MAX_AGE = 8 * 60 * 60;
const ADMIN_BODY_MAX = 950_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const json = (data, status = 200, extraHeaders = {}) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
    "Pragma": "no-cache",
    ...extraHeaders
  }
});
function env(name) {
  try {
    const value = typeof Netlify !== "undefined" ? Netlify.env.get(name) : undefined;
    if (value) return value;
  } catch { /* Netlify.env may be unavailable in local compatibility mode. */ }
  return typeof process !== "undefined" ? process.env[name] : undefined;
}
function readSessionCookie(request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const pair = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!pair) return "";
  try { return decodeURIComponent(pair.slice(COOKIE_NAME.length + 1)); }
  catch { return ""; }
}
function sessionCookie(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_MAX_AGE}`;
}
function clearCookie() {
  return `${COOKIE_NAME}=; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
async function readJson(request) {
  const raw = await request.text();
  if (raw.length > ADMIN_BODY_MAX) throw new Error("payload_too_large");
  return JSON.parse(raw);
}
async function callRpc(name, args) {
  const supabaseUrl = env("SUPABASE_URL");
  const apiKey = env("SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !apiKey) throw new Error("service_unavailable");
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(args)
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  return { response, data };
}
function validOptionalText(value, maxLength) {
  return value === undefined || value === null || (typeof value === "string" && value.length <= maxLength);
}
function optionalText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}
function validScheduleDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
function scheduleTimeMinutes(value) {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}
export default async (request) => {
  const cookie = readSessionCookie(request);
  try {
    if (request.method === "POST") {
      let body;
      try { body = await readJson(request); }
      catch (error) {
        return error.message === "payload_too_large"
          ? json({ ok: false, message: "Demande trop volumineuse." }, 413)
          : json({ ok: false, message: "Format de demande invalide." }, 400);
      }
      if (body.action !== "login") return json({ ok: false, message: "Action invalide." }, 400);
      const username = typeof body.username === "string" ? body.username.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!username || !password || username.length > 64 || password.length > 256) {
        return json({ ok: false, message: "Identifiant ou mot de passe incorrect." }, 401);
      }
      const { response, data } = await callRpc("admin_login", { p_username: username, p_password: password });
      if (!response.ok || !data?.ok || typeof data.token !== "string") {
        if (data?.locked) return json({ ok: false, message: "Trop de tentatives. Réessayez dans 15 minutes." }, 429);
        if (response.status >= 500) return json({ ok: false, message: "Service de connexion indisponible." }, 503);
        return json({ ok: false, message: "Identifiant ou mot de passe incorrect." }, 401);
      }
      return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(data.token) });
    }
    if (request.method === "GET") {
      if (!cookie) return json({ ok: false, message: "Session requise." }, 401);
      const params = new URL(request.url).searchParams;
      const limit = Math.min(100, Math.max(1, Number.parseInt(params.get("limit") || "50", 10) || 50));
      const offset = Math.max(0, Number.parseInt(params.get("offset") || "0", 10) || 0);
      const resource = params.get("resource");
      if (resource && !["proposals", "workshops"].includes(resource)) {
        return json({ ok: false, message: "Ressource invalide." }, 400);
      }
      const rpcName = resource === "proposals"
        ? "admin_list_workshop_proposals"
        : resource === "workshops" ? "admin_list_workshops_v2" : "admin_list_registrations_v2";
      const { response, data } = await callRpc(rpcName, { p_token: cookie, p_limit: limit, p_offset: offset });
      if (!response.ok) return json({ ok: false, message: "Session expirée ou accès refusé." }, response.status === 401 ? 401 : 503, { "Set-Cookie": clearCookie() });
      if (resource === "proposals") return json({ ok: true, proposals: Array.isArray(data) ? data : [] });
      if (resource === "workshops") return json({ ok: true, workshops: Array.isArray(data) ? data : [] });
      return json(Array.isArray(data) ? data : [], 200);
    }
    if (request.method === "PATCH") {
      if (!cookie) return json({ ok: false, message: "Session requise." }, 401);
      let body;
      try { body = await readJson(request); }
      catch (error) {
        return error.message === "payload_too_large"
          ? json({ ok: false, message: "Demande trop volumineuse." }, 413)
          : json({ ok: false, message: "Format de demande invalide." }, 400);
      }
      if (body.action === "update-status") {
        const validId = typeof body.id === "string" && UUID_PATTERN.test(body.id);
        const allowedStatuses = new Set(["new", "reviewed", "accepted", "waitlisted", "rejected"]);
        if (!validId || !allowedStatuses.has(body.status)) return json({ ok: false, message: "Données de statut invalides." }, 400);
        const { response, data } = await callRpc("admin_update_registration", {
          p_token: cookie,
          p_id: body.id,
          p_status: body.status,
          p_admin_notes: null
        });
        if (!response.ok) return json({ ok: false, message: "Mise à jour refusée." }, response.status === 401 ? 401 : 400);
        return json({ ok: data === true });
      }
      if (body.action === "update-proposal-status") {
        const statuses = new Set(["received", "under_review", "accepted", "rejected"]);
        if (typeof body.proposal_id !== "string" || !UUID_PATTERN.test(body.proposal_id) || !statuses.has(body.status) || !validOptionalText(body.admin_notes, 4000)) {
          return json({ ok: false, message: "Données de proposition invalides." }, 400);
        }
        const { response, data } = await callRpc("admin_update_workshop_proposal", {
          p_token: cookie,
          p_id: body.proposal_id,
          p_status: body.status,
          p_admin_notes: optionalText(body.admin_notes)
        });
        if (!response.ok) return json({ ok: false, message: "Mise à jour refusée." }, response.status === 401 ? 401 : 400);
        return json({ ok: data === true });
      }
      if (body.action === "upsert-workshop") {
        if (typeof body.slug !== "string" || body.slug.length > 80 || !SLUG_PATTERN.test(body.slug) ||
            typeof body.registration_code !== "string" || body.registration_code.length > 100 || !SLUG_PATTERN.test(body.registration_code) ||
            !validOptionalText(body.title, 140) || !validOptionalText(body.theme, 100) ||
            !validOptionalText(body.summary, 1200) || !validOptionalText(body.description, 6000) ||
            !validOptionalText(body.facilitator_name, 120) || !validOptionalText(body.facilitator_role, 120) || !validOptionalText(body.facilitator_bio, 600) ||
            !validOptionalText(body.facilitator_photo_data, 650000) ||
            (body.duration_minutes !== null && body.duration_minutes !== undefined && (!Number.isInteger(body.duration_minutes) || body.duration_minutes < 15 || body.duration_minutes > 600)) ||
            !["draft", "published", "archived"].includes(body.status) || typeof body.facilitator_consent !== "boolean" ||
            !Number.isInteger(body.sort_order) || body.sort_order < 0 || body.sort_order > 10000 ||
            (body.id !== undefined && body.id !== null && (typeof body.id !== "string" || !UUID_PATTERN.test(body.id))) ||
            (body.source_proposal_id !== undefined && body.source_proposal_id !== null && (typeof body.source_proposal_id !== "string" || !UUID_PATTERN.test(body.source_proposal_id)))) {
          return json({ ok: false, message: "Données de l’atelier invalides." }, 400);
        }
        const scheduleDate = optionalText(body.schedule_date);
        const startTime = optionalText(body.start_time);
        const endTime = optionalText(body.end_time);
        const scheduleIsEmpty = !scheduleDate && !startTime && !endTime;
        const startMinutes = startTime ? scheduleTimeMinutes(startTime) : null;
        const endMinutes = endTime ? scheduleTimeMinutes(endTime) : null;
        if (!validOptionalText(body.schedule_date, 10) || !validOptionalText(body.start_time, 8) ||
            !validOptionalText(body.end_time, 8) || !validOptionalText(body.room, 160) ||
            (!scheduleIsEmpty && (!validScheduleDate(scheduleDate) || startMinutes === null || endMinutes === null || startMinutes >= endMinutes))) {
          return json({ ok: false, message: "Planning invalide : indiquez une date, une heure de début et une heure de fin ultérieure, ou laissez le planning vide." }, 400);
        }
        const photo = optionalText(body.facilitator_photo_data);
        if (photo && (!photo.startsWith("data:image/jpeg;base64,") || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo))) {
          return json({ ok: false, message: "La photo doit être une image JPEG encodée en base64." }, 400);
        }
        if (!body.facilitator_consent && (photo || optionalText(body.facilitator_name) || optionalText(body.facilitator_role) || optionalText(body.facilitator_bio))) {
          return json({ ok: false, message: "Le consentement du facilitateur est requis pour ses informations ou sa photo." }, 400);
        }
        const { response, data } = await callRpc("admin_upsert_workshop_v2", {
          p_token: cookie,
          p_id: body.id || null,
          p_slug: body.slug,
          p_registration_code: optionalText(body.registration_code),
          p_title: optionalText(body.title),
          p_theme: optionalText(body.theme),
          p_summary: optionalText(body.summary),
          p_description: optionalText(body.description),
          p_duration_minutes: body.duration_minutes ?? null,
          p_status: body.status,
          p_facilitator_name: optionalText(body.facilitator_name),
          p_facilitator_role: optionalText(body.facilitator_role),
          p_facilitator_bio: optionalText(body.facilitator_bio),
          p_facilitator_photo_data: photo,
          p_facilitator_consent: body.facilitator_consent,
          p_sort_order: body.sort_order,
          p_source_proposal_id: body.source_proposal_id || null,
          p_schedule_date: scheduleDate,
          p_start_time: startTime,
          p_end_time: endTime,
          p_room: optionalText(body.room)
        });
        if (!response.ok) return json({ ok: false, message: "Enregistrement de l’atelier refusé." }, response.status === 401 ? 401 : 400);
        return json({ ok: true, id: data });
      }
      if (body.action === "create-workshop-from-proposal") {
        if (typeof body.proposal_id !== "string" || !UUID_PATTERN.test(body.proposal_id) ||
            typeof body.slug !== "string" || body.slug.length > 80 || !SLUG_PATTERN.test(body.slug)) {
          return json({ ok: false, message: "Données de création invalides." }, 400);
        }
        const { response, data } = await callRpc("admin_create_workshop_from_proposal", {
          p_token: cookie,
          p_proposal_id: body.proposal_id,
          p_slug: body.slug
        });
        if (!response.ok) return json({ ok: false, message: "Création de l’atelier refusée." }, response.status === 401 ? 401 : 400);
        return json({ ok: true, id: data });
      }
      if (body.action === "change-password") {
        const newPassword = typeof body.new_password === "string" ? body.new_password : "";
        if (newPassword.length < 12 || newPassword.length > 256) return json({ ok: false, message: "Le nouveau mot de passe doit contenir au moins 12 caractères." }, 400);
        const { response, data } = await callRpc("admin_change_password", { p_token: cookie, p_new_password: newPassword });
        if (!response.ok || data !== true) return json({ ok: false, message: "Le mot de passe n’a pas été modifié." }, 400);
        return json({ ok: true });
      }
      return json({ ok: false, message: "Action invalide." }, 400);
    }
    if (request.method === "DELETE") {
      if (cookie) {
        try { await callRpc("admin_logout", { p_token: cookie }); } catch { /* cookie is still cleared below */ }
      }
      return json({ ok: true }, 200, { "Set-Cookie": clearCookie() });
    }
    return json({ ok: false, message: "Méthode non autorisée." }, 405);
  } catch {
    return json({ ok: false, message: "Service administrateur momentanément indisponible." }, 503);
  }
};
export const config = {
  path: "/api/admin",
  method: ["GET", "POST", "PATCH", "DELETE"],
  rateLimit: { action: "rate_limit", aggregateBy: "ip", windowSize: 60, windowLimit: 40 }
};
