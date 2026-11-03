(() => {
  const status = document.querySelector("#programme-status");
  const items = [...document.querySelectorAll(".schedule-item[data-workshop-code]")];
  if (!items.length) return;

  const text = (value) => typeof value === "string" ? value.trim() : "";
  const formatDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: "UTC" }).format(date);
  };

  async function loadSchedule() {
    try {
      const response = await fetch("/api/workshops", { headers: { Accept: "application/json" }, credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("Programme indisponible");
      const result = await response.json();
      if (result?.ok !== true || !Array.isArray(result.workshops)) throw new Error("Réponse invalide");
      const workshops = result.workshops;
      let confirmed = 0;
      for (const card of items) {
        const code = card.dataset.workshopCode || "";
        const workshop = workshops.find((entry) => text(entry.registration_code) === code || (code === "general" && ["ict4d", "general"].includes(text(entry.slug))));
        if (!workshop) continue;
        const date = formatDate(text(workshop.schedule_date));
        const start = text(workshop.start_time).slice(0, 5);
        const end = text(workshop.end_time).slice(0, 5);
        const room = text(workshop.room);
        const dateNode = card.querySelector("[data-schedule-date]");
        const timeNode = card.querySelector("[data-schedule-time]");
        const roomNode = card.querySelector("[data-schedule-room]");
        if (date && dateNode) { dateNode.textContent = date; confirmed += 1; }
        if (/^\d{2}:\d{2}$/.test(start) && /^\d{2}:\d{2}$/.test(end)) {
          if (timeNode) timeNode.textContent = `${start}–${end} · heure de Yaoundé`;
          confirmed += 1;
        }
        if (room && roomNode) { roomNode.textContent = `Salle ${room}`; confirmed += 1; }
      }
      if (status) status.textContent = confirmed ? "Les informations confirmées sont affichées ci-dessous." : "Les dates, horaires et salles ne sont pas encore confirmés.";
    } catch {
      if (status) status.textContent = "Les dates, horaires et salles seront ajoutés après confirmation par l’équipe.";
    }
  }
  loadSchedule();
})();
