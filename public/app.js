(() => {
  const form = document.querySelector("#registration-form");
  const message = document.querySelector("#form-message");
  const successCard = document.querySelector("#success-card");
  const workshopOptions = document.querySelector("#workshop-options");
  const workshopSelect = document.querySelector("#workshop");
  const submitButton = form?.querySelector(".submit-button");
  const submitLabel = form?.querySelector(".submit-label");
  const menuToggle = document.querySelector(".menu-toggle");
  const mainNav = document.querySelector("#main-navigation");
  const defaultWorkshop = form?.dataset.defaultWorkshop || "";

  function showMessage(text, kind = "") {
    if (!message) return;
    message.textContent = text;
    message.className = `form-message${kind ? ` ${kind}` : ""}`;
  }

  function closeMenu() {
    if (!menuToggle || !mainNav) return;
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Ouvrir le menu");
    mainNav.classList.remove("is-open");
  }

  menuToggle?.addEventListener("click", () => {
    const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", String(!isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Ouvrir le menu" : "Fermer le menu");
    mainNav?.classList.toggle("is-open", !isOpen);
  });
  mainNav?.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  for (const button of document.querySelectorAll(".choose-workshop")) {
    button.addEventListener("click", () => {
      const code = button.dataset.workshop || "";
      window.location.assign(`/inscription/${code ? `?workshop=${encodeURIComponent(code)}` : ""}`);
    });
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (form?.dataset.registrationMode === "multi") return;
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    const payload = {
      full_name: String(values.get("full_name") || "").trim(),
      email: String(values.get("email") || "").trim().toLowerCase(),
      level: String(values.get("level") || ""),
      workshop: String(values.get("workshop") || ""),
      consent: values.get("consent") === "on",
      website: String(values.get("website") || "").trim()
    };
    showMessage("");
    if (submitButton) submitButton.disabled = true;
    if (submitLabel) submitLabel.textContent = "Envoi en cours…";
    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 201 || (response.ok && result.ok)) {
        form.hidden = true;
        if (successCard) successCard.hidden = false;
        return;
      }
      if (response.status === 409) {
        showMessage("Cette adresse e-mail est déjà préinscrite à cet atelier.", "error");
      } else if (response.status === 429) {
        showMessage("Trop de demandes rapprochées. Réessayez dans quelques instants.", "error");
      } else if (response.status === 400) {
        showMessage(result.message || "Vérifiez les champs du formulaire puis réessayez.", "error");
      } else {
        showMessage("L’envoi n’a pas abouti. Réessayez dans quelques instants.", "error");
      }
    } catch {
      showMessage("Connexion indisponible. Vérifiez votre réseau puis réessayez.", "error");
    } finally {
      if (submitButton) submitButton.disabled = false;
      if (submitLabel) submitLabel.textContent = "Envoyer ma préinscription";
    }
  });

  document.querySelector("#new-registration")?.addEventListener("click", () => {
    form?.reset();
    if (workshopSelect && defaultWorkshop) workshopSelect.value = defaultWorkshop;
    if (form) form.hidden = false;
    if (successCard) successCard.hidden = true;
    showMessage("");
    document.querySelector("#full_name")?.focus();
  });

  const proposalForm = document.querySelector("#proposal-form");
  const proposalType = document.querySelector("#proposal-type");
  const targetWorkshopRow = document.querySelector("#target-workshop-row");
  const targetWorkshop = document.querySelector("#target-workshop-slug");
  const proposalMessage = document.querySelector("#proposal-message");
  const proposalSubmit = document.querySelector("#proposal-submit");
  const proposalSubmitLabel = proposalSubmit?.querySelector(".submit-label");
  const proposalSuccess = document.querySelector("#proposal-success");
  function updateProposalTarget() {
    const isImprovement = proposalType?.value === "improvement";
    if (targetWorkshopRow) targetWorkshopRow.hidden = !isImprovement;
    if (targetWorkshop) targetWorkshop.required = isImprovement;
    if (!isImprovement && targetWorkshop) targetWorkshop.value = "";
  }
  proposalType?.addEventListener("change", updateProposalTarget);
  updateProposalTarget();
  proposalForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    updateProposalTarget();
    if (!proposalForm.reportValidity()) return;
    const values = new FormData(proposalForm);
    const payload = {
      proposer_name: String(values.get("proposer_name") || "").trim(),
      contact_email: String(values.get("contact_email") || "").trim().toLowerCase(),
      proposal_type: String(values.get("proposal_type") || ""),
      target_workshop_slug: String(values.get("target_workshop_slug") || ""),
      title: String(values.get("title") || "").trim(),
      theme: String(values.get("theme") || "").trim(),
      summary: String(values.get("summary") || "").trim(),
      duration_minutes: Number(values.get("duration_minutes")),
      consent: values.get("consent") === "on",
      website: String(values.get("website") || "").trim()
    };
    if (proposalMessage) {
      proposalMessage.textContent = "";
      proposalMessage.className = "form-message";
    }
    if (proposalSubmit) proposalSubmit.disabled = true;
    if (proposalSubmitLabel) proposalSubmitLabel.textContent = "Envoi en cours…";
    try {
      const response = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 201) {
        proposalForm.hidden = true;
        if (proposalSuccess) proposalSuccess.hidden = false;
      } else if (proposalMessage) {
        proposalMessage.textContent = response.status === 429
          ? "Trop de propositions rapprochées. Réessayez dans quelques instants."
          : [400, 409].includes(response.status)
            ? (result.message || "Vérifiez les champs puis réessayez.")
            : "L’envoi n’a pas abouti. Réessayez dans quelques instants.";
        proposalMessage.className = "form-message error";
      }
    } catch {
      if (proposalMessage) {
        proposalMessage.textContent = "Connexion indisponible. Vérifiez votre réseau puis réessayez.";
        proposalMessage.className = "form-message error";
      }
    } finally {
      if (proposalSubmit) proposalSubmit.disabled = false;
      if (proposalSubmitLabel) proposalSubmitLabel.textContent = "Envoyer la proposition";
    }
  });

  const staticWorkshopPages = {
    ict4d: "/sessions/ict4d/",
    general: "/sessions/ict4d/",
    gdevelop: "/sessions/gdevelop/",
    "git-github": "/sessions/git-github/",
    cybersecurite: "/sessions/cybersecurite/",
    "developpement-mobile": "/sessions/developpement-mobile/"
  };
  const workshopImages = {
    ict4d: "/assets/illustration-ict4d-canva.webp",
    general: "/assets/illustration-ict4d-canva.webp",
    gdevelop: "/assets/illustration-gdevelop-canva.webp",
    "git-github": "/assets/illustration-project-canva.webp",
    cybersecurite: "/assets/illustration-cybersecurity-canva.webp",
    "developpement-mobile": "/assets/illustration-mobile-canva.webp"
  };
  const workshopTags = {
    ict4d: "BIEN PLUS QUE DU CODE",
    general: "BIEN PLUS QUE DU CODE",
    gdevelop: "CRÉATION NUMÉRIQUE",
    "git-github": "DE L’IDÉE AU DÉPLOIEMENT",
    cybersecurite: "DÉTECTE · PROTÈGE · RÉAGIS",
    "developpement-mobile": "DE L’IDÉE À L’APPLICATION"
  };

  function text(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function imageSource(value) {
    const source = text(value);
    if (/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(source)) return source;
    if (/^(?:[a-z0-9+/]{32,}={0,2})$/i.test(source)) return `data:image/jpeg;base64,${source}`;
    return "";
  }

  function workshopImagePath(value) {
    const source = text(value);
    return /^\/assets\/[A-Za-z0-9][A-Za-z0-9._-]{0,200}[.](?:png|jpe?g|webp)$/i.test(source) ? source : "";
  }

  function addWorkshopOption(select, code, title) {
    if (!select || !code || [...select.options].some((option) => option.value === code)) return;
    const option = document.createElement("option");
    option.value = code;
    option.textContent = title || code;
    select.append(option);
  }


  function scheduleParts(workshop) {
    const date = text(workshop.schedule_date);
    const start = text(workshop.start_time).slice(0, 5);
    const end = text(workshop.end_time).slice(0, 5);
    const room = text(workshop.room);
    const parts = [];
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const [year, month, day] = date.split("-").map(Number);
      parts.push(new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day))));
    }
    if (start && end) parts.push(`${start}–${end} · heure locale de Yaoundé`);
    else if (start) parts.push(`Dès ${start} · heure locale de Yaoundé`);
    if (room) parts.push(`Salle ${room}`);
    return parts;
  }

  function renderRegistrationOptions(workshops) {
    if (!workshopOptions) return;
    const selectedBefore = new Set([...workshopOptions.querySelectorAll('input[name="workshops"]:checked')].map((input) => input.value));
    const requestedCode = new URLSearchParams(window.location.search).get("workshop") || "";
    const items = workshops.filter((workshop) => text(workshop.registration_code) && text(workshop.title));
    if (!items.length) return;
    workshopOptions.replaceChildren();
    for (const workshop of items) {
      const code = text(workshop.registration_code);
      const id = `workshop-${code.replace(/[^a-z0-9-]/g, "-")}`;
      const label = document.createElement("label");
      label.className = "workshop-choice";
      label.htmlFor = id;
      const input = document.createElement("input");
      input.type = "checkbox";
      input.id = id;
      input.name = "workshops";
      input.value = code;
      input.dataset.scheduleDate = text(workshop.schedule_date);
      input.dataset.startTime = text(workshop.start_time).slice(0, 5);
      input.dataset.endTime = text(workshop.end_time).slice(0, 5);
      input.checked = selectedBefore.has(code) || requestedCode === code;
      const copy = document.createElement("span");
      copy.className = "workshop-choice-copy";
      const title = document.createElement("strong");
      title.textContent = text(workshop.title);
      const theme = document.createElement("span");
      theme.textContent = text(workshop.theme) || "Atelier ICT4D";
      const schedule = document.createElement("span");
      schedule.className = "workshop-choice-schedule";
      schedule.textContent = scheduleParts(workshop).join(" · ") || "Horaire et salle à confirmer";
      copy.append(title, theme, schedule);
      label.append(input, copy);
      workshopOptions.append(label);
    }
    workshopOptions.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function publicFacilitator(workshop) {
    // /api/workshops ne renseigne ces champs que pour un profil rendu public avec accord.
    const name = text(workshop.facilitator_name);
    const photo = imageSource(workshop.facilitator_photo_data);
    if (!name || !photo) return null;
    return { name, photo, role: text(workshop.facilitator_role), bio: text(workshop.facilitator_bio) };
  }

  function createWorkshopCard(workshop) {
    const slug = text(workshop.slug);
    const code = text(workshop.registration_code);
    const title = text(workshop.title);
    if (!slug || !title) return null;
    const card = document.createElement("article");
    const cardCategory = ({ ict4d: "card-general", general: "card-general", gdevelop: "card-game", "git-github": "card-git", cybersecurite: "card-cybersecurity", "developpement-mobile": "card-mobile" })[slug] || "card-published";
    card.className = `workshop-card ${cardCategory}`;
    const visual = document.createElement("div");
    visual.className = "workshop-visual";
    const image = document.createElement("img");
    image.src = workshopImagePath(workshop.image_path) || workshopImages[slug] || "/assets/illustration-general-web.jpg";
    image.alt = `Illustration de l’atelier ${title}`;
    image.loading = "lazy";
    image.decoding = "async";
    visual.append(image);
    const tag = document.createElement("p");
    tag.className = "card-tag";
    tag.textContent = text(workshop.theme) || workshopTags[slug] || "ATELIER ICT4D";
    const heading = document.createElement("h3");
    heading.textContent = title;
    const summary = document.createElement("p");
    summary.textContent = text(workshop.summary) || "Découvrez le contenu de cet atelier ICT4D.";
    const scheduleText = scheduleParts(workshop).join(" · ");
    const schedule = scheduleText ? document.createElement("p") : null;
    if (schedule) {
      schedule.className = "workshop-schedule";
      schedule.textContent = scheduleText;
    }
    const link = document.createElement("a");
    link.className = "text-button";
    link.href = staticWorkshopPages[slug] || `/sessions/${encodeURIComponent(slug)}/`;
    link.append(document.createTextNode("Découvrir "));
    const arrow = document.createElement("span");
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "→";
    link.append(arrow);
    const registerLink = document.createElement("a");
    registerLink.className = "button button-quiet workshop-register-link";
    registerLink.href = `/inscription/?workshop=${encodeURIComponent(code)}`;
    registerLink.textContent = "Choisir cet atelier";
    card.append(visual, tag, heading, summary);
    if (schedule) card.append(schedule);
    card.append(link, registerLink);
    const presenceSelect = document.querySelector("#presence-workshop");
    addWorkshopOption(presenceSelect, code, title);
    const presenceOption = presenceSelect && [...presenceSelect.options].find((option) => option.value === code);
    if (presenceOption) presenceOption.dataset.scheduleText = scheduleText;
    addWorkshopOption(document.querySelector("#target-workshop-slug"), slug, title);
    return card;
  }

  function renderFacilitators(workshops) {
    const list = document.querySelector("#facilitator-list");
    if (!list) return;
    const published = workshops.map((workshop) => ({ workshop, person: publicFacilitator(workshop) })).filter((item) => item.person);
    list.replaceChildren();
    if (!published.length) {
      const empty = document.createElement("p");
      empty.className = "facilitator-empty";
      empty.textContent = "Les intervenants seront présentés avec leur accord.";
      list.append(empty);
      return;
    }
    for (const { workshop, person } of published) {
      const card = document.createElement("article");
      card.className = "facilitator-card";
      const photo = document.createElement("img");
      photo.className = "facilitator-photo";
      photo.src = person.photo;
      photo.alt = `Portrait de ${person.name}`;
      photo.loading = "lazy";
      const details = document.createElement("div");
      const workshopTitle = document.createElement("p");
      workshopTitle.className = "card-tag";
      workshopTitle.textContent = text(workshop.title) || "Atelier ICT4D";
      const name = document.createElement("h3");
      name.textContent = person.name;
      details.append(workshopTitle, name);
      if (person.role) {
        const role = document.createElement("p");
        role.className = "facilitator-role";
        role.textContent = person.role;
        details.append(role);
      }
      if (person.bio) {
        const bio = document.createElement("p");
        bio.className = "facilitator-bio";
        bio.textContent = person.bio;
        details.append(bio);
      }
      card.append(photo, details);
      list.append(card);
    }
  }

  async function loadPublishedWorkshops() {
    try {
      const response = await fetch("/api/workshops", { headers: { Accept: "application/json" }, credentials: "same-origin", cache: "no-store" });
      if (!response.ok) return;
      const result = await response.json();
      if (result?.ok !== true || !Array.isArray(result.workshops)) return;
      const cards = result.workshops.map(createWorkshopCard).filter(Boolean);
      const list = document.querySelector("#workshop-list");
      if (list) {
        list.replaceChildren();
        if (cards.length) list.append(...cards);
        else {
          const empty = document.createElement("p");
          empty.className = "empty-state published-workshops-empty";
          empty.textContent = "Les prochains ateliers publiés seront présentés ici.";
          list.append(empty);
        }
      }
      renderRegistrationOptions(result.workshops);
      renderFacilitators(result.workshops);
      const note = document.querySelector("#workshop-load-note");
      if (note) note.textContent = "";
    } catch {
      // Les trois cartes statiques et le message de consentement restent le fallback hors ligne.
    }
  }
  loadPublishedWorkshops();

  const canvas = document.querySelector("#presence-card-canvas");
  if (canvas) {
    const context = canvas.getContext("2d");
    const nameInput = document.querySelector("#presence-name");
    const workshopInput = document.querySelector("#presence-workshop");
    const messageInput = document.querySelector("#presence-message");
    const photoInput = document.querySelector("#presence-photo");
    const previewStatus = document.querySelector("#presence-status");
    let participantPhoto = null;
    let photoObjectUrl = "";
    const width = 1000;
    const height = 1250;

    function roundedRect(ctx, x, y, w, h, radius, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, radius);
      ctx.fill();
    }

    function wrapText(ctx, value, x, y, maxWidth, lineHeight, maxLines = 3) {
      const words = value.split(/\s+/).filter(Boolean);
      let line = "";
      let lines = 0;
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (ctx.measureText(next).width > maxWidth && line) {
          ctx.fillText(line, x, y + lines * lineHeight);
          line = word;
          lines += 1;
          if (lines >= maxLines) return;
        } else line = next;
      }
      if (line && lines < maxLines) ctx.fillText(line, x, y + lines * lineHeight);
    }

    function drawImageCrop(ctx, image, x, y, w, h) {
      const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
      const sw = w / scale;
      const sh = h / scale;
      const sx = (image.naturalWidth - sw) / 2;
      const sy = (image.naturalHeight - sh) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 26);
      ctx.clip();
      ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
      ctx.restore();
    }

    function drawPresenceCard() {
      if (!context) return;
      const paper = "#fffaf0";
      const navy = "#0b315c";
      const blue = "#41b4d7";
      const orange = "#f6a63b";
      const red = "#e56c55";
      const cream = "#fffaf0";
      const participantName = text(nameInput?.value) || "Votre nom / pseudo";
      const selectedOption = workshopInput?.selectedOptions?.[0];
      const workshopTitle = selectedOption && selectedOption.value ? selectedOption.textContent : "Atelier ICT4D";
      const shortMessage = text(messageInput?.value) || "Prêt·e à apprendre, expérimenter et créer.";
      context.clearRect(0, 0, width, height);
      context.fillStyle = paper;
      context.fillRect(0, 0, width, height);
      context.fillStyle = navy;
      context.fillRect(0, 0, width, 165);
      context.fillStyle = orange;
      context.beginPath();
      context.arc(900, 82, 28, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = blue;
      context.fillRect(0, 165, 18, 805);
      context.fillStyle = red;
      context.fillRect(36, 213, 14, 90);
      context.fillStyle = navy;
      context.font = "800 28px Inter, Arial, sans-serif";
      context.letterSpacing = "4px";
      context.fillText("ICT4D · UNIVERSITÉ DE YAOUNDÉ I", 72, 104);
      context.letterSpacing = "0px";
      context.fillStyle = navy;
      context.font = "900 96px Inter, Arial, sans-serif";
      context.fillText("I WILL", 72, 365);
      context.fillStyle = "#0f70b7";
      context.font = "900 92px Inter, Arial, sans-serif";
      context.fillText("BE THERE", 72, 468);
      roundedRect(context, 72, 518, 420, 4, 2, orange);
      context.fillStyle = "#59738a";
      context.font = "700 24px Inter, Arial, sans-serif";
      context.fillText("JE SERAI LÀ POUR", 72, 570);
      context.fillStyle = navy;
      context.font = "800 35px Inter, Arial, sans-serif";
      wrapText(context, workshopTitle, 72, 620, 425, 43, 3);
      roundedRect(context, 586, 283, 335, 346, 24, "#ffffff");
      if (participantPhoto) {
        drawImageCrop(context, participantPhoto, 600, 297, 307, 318);
      } else {
        roundedRect(context, 600, 297, 307, 318, 18, "#dff4fb");
        context.fillStyle = blue;
        context.beginPath();
        context.arc(754, 400, 74, Math.PI, Math.PI * 2);
        context.fill();
        context.fillStyle = orange;
        context.fillRect(600, 480, 153, 135);
        context.fillStyle = "#0f70b7";
        context.fillRect(753, 480, 154, 135);
        context.fillStyle = paper;
        context.font = "800 19px Inter, Arial, sans-serif";
        context.textAlign = "center";
        context.fillText("PLACE À VOTRE PHOTO", 753, 456);
        context.textAlign = "left";
      }
      context.fillStyle = navy;
      context.font = "900 40px Inter, Arial, sans-serif";
      wrapText(context, participantName, 72, 760, 845, 48, 2);
      context.fillStyle = "#42617b";
      context.font = "500 28px Inter, Arial, sans-serif";
      wrapText(context, shortMessage, 72, 872, 825, 38, 2);
      context.fillStyle = "#dff4fb";
      context.beginPath();
      context.arc(872, 780, 36, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = navy;
      context.font = "800 23px Inter, Arial, sans-serif";
      context.fillText("DATES ET LIEU À VENIR", 72, 1032);
      context.fillStyle = "#59738a";
      context.font = "600 23px Inter, Arial, sans-serif";
      context.fillText("Ateliers ICT4D · Université de Yaoundé I", 72, 1080);
      context.fillStyle = navy;
      context.fillRect(0, 1144, width, 106);
      context.fillStyle = cream;
      context.font = "800 28px Inter, Arial, sans-serif";
      context.fillText("APPRENDRE  ·  EXPÉRIMENTER  ·  CRÉER", 72, 1210);
      if (previewStatus) previewStatus.textContent = "Aperçu généré localement sur cet appareil.";
    }

    for (const input of [nameInput, workshopInput, messageInput]) input?.addEventListener("input", drawPresenceCard);
    workshopInput?.addEventListener("change", drawPresenceCard);
    photoInput?.addEventListener("change", () => {
      const file = photoInput.files?.[0];
      participantPhoto = null;
      if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
      photoObjectUrl = "";
      if (!file) {
        drawPresenceCard();
        return;
      }
      if (!file.type.startsWith("image/")) {
        if (previewStatus) previewStatus.textContent = "Choisissez un fichier image. Aucune donnée n’a été envoyée.";
        photoInput.value = "";
        drawPresenceCard();
        return;
      }
      photoObjectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        participantPhoto = image;
        drawPresenceCard();
      };
      image.onerror = () => {
        if (previewStatus) previewStatus.textContent = "Cette image ne peut pas être affichée.";
        drawPresenceCard();
      };
      image.src = photoObjectUrl;
    });

    function canvasPngFile() {
      return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(new File([blob], "carte-ict4d-i-will-be-there.png", { type: "image/png" })) : reject(new Error("PNG indisponible")), "image/png"));
    }

    document.querySelector("#download-presence-card")?.addEventListener("click", () => {
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "carte-ict4d-i-will-be-there.png";
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, "image/png");
    });

    const shareButton = document.querySelector("#share-presence-card");
    if (shareButton && typeof navigator.share === "function" && typeof File !== "undefined") shareButton.hidden = false;
    shareButton?.addEventListener("click", async () => {
      try {
        const file = await canvasPngFile();
        const shareData = { title: "Ma carte ICT4D", text: "I will be there — Ateliers ICT4D, Université de Yaoundé I", files: [file] };
        if (navigator.canShare && !navigator.canShare({ files: [file] })) {
          if (previewStatus) previewStatus.textContent = "Le partage de fichiers n’est pas disponible ici. Téléchargez la carte PNG pour la partager.";
          return;
        }
        await navigator.share(shareData);
        if (previewStatus) previewStatus.textContent = "Carte partagée selon votre choix.";
      } catch (error) {
        if (error?.name !== "AbortError" && previewStatus) previewStatus.textContent = "Le partage n’a pas abouti. Vous pouvez télécharger la carte PNG.";
      }
    });
    drawPresenceCard();
  }
})();
