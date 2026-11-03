(() => {
  const byId = (id) => document.getElementById(id);
  const text = (value) => typeof value === "string" ? value.trim() : "";
  const photoSource = (value) => {
    const source = text(value);
    if (/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(source)) return source;
    if (/^(?:[a-z0-9+/]{32,}={0,2})$/i.test(source)) return `data:image/jpeg;base64,${source}`;
    return "";
  };
  const workshopImagePath = (value) => {
    const source = text(value);
    return /^\/assets\/[A-Za-z0-9][A-Za-z0-9._-]{0,200}[.](?:png|jpe?g|webp)$/i.test(source) ? source : "";
  };

  function setText(id, value) {
    const element = byId(id);
    const content = text(value);
    if (element && content) {
      element.textContent = content;
      element.hidden = false;
      return true;
    }
    if (element) element.hidden = true;
    return false;
  }

  function showUnavailable() {
    byId("workshop-load-error")?.removeAttribute("hidden");
    const hero = document.querySelector(".dynamic-workshop-hero");
    if (hero) hero.closest(".detail-hero")?.setAttribute("hidden", "");
    byId("workshop-details")?.setAttribute("hidden", "");
    byId("workshop-facilitator-section")?.setAttribute("hidden", "");
    document.title = "Atelier indisponible | Ateliers ICT4D";
  }

  async function loadWorkshop() {
    const querySlug = new URLSearchParams(window.location.search).get("slug");
    const pathSlug = window.location.pathname.match(/^\/sessions\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/i)?.[1];
    const slug = text(querySlug || pathSlug).toLowerCase();
    if (!slug || slug.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      showUnavailable();
      return;
    }
    try {
      const response = await fetch(`/api/workshops?slug=${encodeURIComponent(slug)}`, { headers: { Accept: "application/json" }, credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("API indisponible");
      const result = await response.json();
      if (result?.ok !== true || !Array.isArray(result.workshops)) throw new Error("Réponse invalide");
      const workshop = result.workshops.find((item) => text(item.slug) === slug);
      if (!workshop) {
        showUnavailable();
        return;
      }

      const title = text(workshop.title);
      if (!title) {
        showUnavailable();
        return;
      }
      document.title = `${title} | Ateliers ICT4D`;
      setText("workshop-title", title);
      setText("workshop-theme", workshop.theme);
      setText("workshop-summary", workshop.summary);
      const workshopImage = byId("workshop-image");
      const imagePath = workshopImagePath(workshop.image_path);
      if (workshopImage && imagePath) {
        workshopImage.src = imagePath;
        workshopImage.alt = `Illustration de l’atelier ${title}`;
        workshopImage.hidden = false;
        byId("workshop-mark")?.setAttribute("hidden", "");
      }
      const scheduleParts = [];
      const scheduleDate = text(workshop.schedule_date);
      const startTime = text(workshop.start_time).slice(0, 5);
      const endTime = text(workshop.end_time).slice(0, 5);
      const room = text(workshop.room);
      if (/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate)) {
        const [year, month, day] = scheduleDate.split("-").map(Number);
        scheduleParts.push(new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day))));
      }
      if (startTime && endTime) scheduleParts.push(`${startTime}–${endTime} · heure locale de Yaoundé`);
      if (room) scheduleParts.push(`Salle ${room}`);
      const scheduleText = scheduleParts.join(" · ");
      const scheduleNode = byId("workshop-schedule");
      if (scheduleText && scheduleNode) { scheduleNode.textContent = scheduleText; scheduleNode.hidden = false; }
      if (scheduleText) {
        byId("workshop-default-note")?.setAttribute("hidden", "");
        setText("workshop-info-title", "Informations pratiques confirmées");
        setText("workshop-info-copy", scheduleText);
      }

      const description = text(workshop.description);
      const duration = Number(workshop.duration_minutes);
      const detailsSection = byId("workshop-details");
      if (description || (Number.isFinite(duration) && duration > 0)) {
        detailsSection?.removeAttribute("hidden");
        setText("workshop-description", description);
        const durationElement = byId("workshop-duration");
        if (Number.isFinite(duration) && duration > 0) {
          durationElement.textContent = `Durée indicative : ${duration} minutes`;
          durationElement.hidden = false;
        }
      }

      const registrationCode = text(workshop.registration_code);
      const registerUrl = `/inscription/?workshop=${encodeURIComponent(registrationCode)}`;
      if (registrationCode) {
        byId("workshop-register")?.setAttribute("href", registerUrl);
        byId("workshop-register-bottom")?.setAttribute("href", registerUrl);
      }

      const name = text(workshop.facilitator_name);
      const photo = photoSource(workshop.facilitator_photo_data);
      if (name && photo) {
        const section = byId("workshop-facilitator-section");
        const image = byId("workshop-facilitator-photo");
        image.src = photo;
        image.alt = `Portrait de ${name}`;
        setText("workshop-facilitator-name", name);
        setText("workshop-facilitator-role", workshop.facilitator_role);
        setText("workshop-facilitator-bio", workshop.facilitator_bio);
        section?.removeAttribute("hidden");
      }
    } catch {
      showUnavailable();
    }
  }

  loadWorkshop();
})();
