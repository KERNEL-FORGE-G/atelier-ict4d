(() => {
  const canvas = document.querySelector("#presence-preview-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const nameInput = document.querySelector("#presence-name");
  const workshopInput = document.querySelector("#presence-workshop");
  const captionInput = document.querySelector("#presence-message");
  const photoInput = document.querySelector("#presence-photo");
  const frame = document.querySelector("#presence-preview-frame");
  const previewStatus = document.querySelector("#presence-status");
  const captionStatus = document.querySelector("#caption-status");
  const formatButtons = [...document.querySelectorAll("[data-format]")];
  let selectedFormat = "square";
  let participantPhoto = null;
  let photoObjectUrl = "";
  let captionWasEdited = false;
  const workshopArtwork = new Map();
  const brandLogo = new Image();
  brandLogo.onload = render;
  brandLogo.src = "/assets/ict4d-logo.png";
  const workshopImages = {
    general: "/assets/illustration-general-web.jpg",
    gdevelop: "/assets/illustration-gdevelop-web.jpg",
    "git-github": "/assets/illustration-git-github-web.jpg",
    cybersecurite: "/assets/illustration-cybersecurity.jpg",
    "developpement-mobile": "/assets/illustration-mobile-development.jpg"
  };

  function clean(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function cropImage(context, image, x, y, width, height, radius) {
    if (!image?.naturalWidth) return;
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const sourceWidth = width / scale;
    const sourceHeight = height / scale;
    const sourceX = (image.naturalWidth - sourceWidth) / 2;
    const sourceY = (image.naturalHeight - sourceHeight) * 0.38;
    context.save();
    roundedRect(context, x, y, width, height, radius);
    context.clip();
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
    context.restore();
  }

  function fittedFont(context, value, maxWidth, startSize, minSize, weight = 850) {
    let size = startSize;
    context.font = `${weight} ${size}px Inter, "Arial", sans-serif`;
    while (size > minSize && context.measureText(value).width > maxWidth) {
      size -= 2;
      context.font = `${weight} ${size}px Inter, "Arial", sans-serif`;
    }
    return size;
  }

  function drawWrapped(context, value, x, y, maxWidth, lineHeight, maxLines, fontSize, color) {
    const words = value.split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    context.font = `850 ${fontSize}px Inter, "Arial", sans-serif`;
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (context.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = word;
        if (lines.length === maxLines - 1) break;
      } else line = next;
    }
    if (line && lines.length < maxLines) lines.push(line);
    if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
      let last = lines[maxLines - 1];
      while (last.length && context.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
      lines[maxLines - 1] = `${last.trimEnd()}…`;
    }
    context.fillStyle = color;
    lines.forEach((text, index) => context.fillText(text, x, y + index * lineHeight));
    return lines.length;
  }

  function selectedWorkshop() {
    const option = workshopInput?.selectedOptions?.[0];
    return {
      value: workshopInput?.value || "general",
      title: clean(option?.textContent) || "Atelier ICT4D",
      schedule: clean(option?.dataset?.scheduleText)
    };
  }

  function updateDefaultCaption() {
    if (captionWasEdited || !captionInput) return;
    const title = selectedWorkshop().title;
    captionInput.value = `J’y serai ! Prêt·e à apprendre et créer à l’atelier « ${title} » de la filière ICT4D.`;
  }

  function drawBackdrop(width, height) {
    ctx.fillStyle = "#f5f9fb";
    ctx.fillRect(0, 0, width, height);
    const wash = ctx.createLinearGradient(0, 0, width, height);
    wash.addColorStop(0, "#f7fbff");
    wash.addColorStop(0.58, "#e9f6fb");
    wash.addColorStop(1, "#fff8e9");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(19,112,183,.08)";
    ctx.beginPath();
    ctx.arc(width * 0.96, height * 0.18, width * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(245,188,48,.20)";
    ctx.beginPath();
    ctx.arc(width * 0.05, height * 0.92, width * 0.17, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBrand(context, width, y, compact = false) {
    const x = 62;
    const size = compact ? 60 : 68;
    context.save();
    context.fillStyle = "rgba(255,255,255,.97)";
    roundedRect(context, x, y, size, size, 16);
    context.fill();
    if (brandLogo.naturalWidth) context.drawImage(brandLogo, x + 5, y + 5, size - 10, size - 10);
    context.restore();
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillStyle = "#ffffff";
    context.font = `850 ${compact ? 24 : 27}px Inter, Arial, sans-serif`;
    context.fillText("ATELIERS ICT4D", x + size + 15, y + size * .38);
    context.fillStyle = "#a8eaf0";
    context.font = `700 ${compact ? 15 : 17}px Inter, Arial, sans-serif`;
    context.fillText("UNIVERSITÉ DE YAOUNDÉ I", x + size + 15, y + size * .72);
    context.textBaseline = "alphabetic";
  }

  function drawTechGlyphs(context, x, y, scale = 1, workshopCode = "general") {
    context.save();
    context.translate(x, y);
    context.scale(scale, scale);
    context.strokeStyle = "rgba(145,227,232,.94)";
    context.fillStyle = "rgba(245,188,48,.98)";
    context.lineWidth = 4;
    context.lineCap = "round";
    context.lineJoin = "round";

    // A small code mark and connected nodes make the technology motif visible but quiet.
    context.font = "850 21px Inter, Arial, sans-serif";
    context.textAlign = "center";
    context.fillStyle = "#a8eaf0";
    context.fillText("</>", 12, 68);
    context.beginPath();
    context.moveTo(58, 43); context.lineTo(83, 26); context.lineTo(105, 43); context.lineTo(83, 60);
    context.stroke();
    for (const [cx, cy] of [[58,43],[83,26],[105,43],[83,60]]) {
      context.beginPath(); context.arc(cx, cy, 4.5, 0, Math.PI * 2); context.fill();
    }

    context.strokeStyle = "#ffffff";
    context.lineWidth = 4.5;
    if (workshopCode === "cybersecurite") {
      context.beginPath();
      context.moveTo(145, 23); context.lineTo(166, 31); context.lineTo(164, 53);
      context.quadraticCurveTo(158, 69, 145, 77); context.quadraticCurveTo(132, 69, 126, 53);
      context.lineTo(124, 31); context.closePath(); context.stroke();
      context.beginPath(); context.arc(145, 44, 7, Math.PI, 0); context.lineTo(152, 57); context.lineTo(138, 57); context.closePath(); context.stroke();
    } else if (workshopCode === "developpement-mobile") {
      context.beginPath(); context.roundRect(132, 16, 27, 58, 5); context.stroke();
      context.beginPath(); context.moveTo(140, 24); context.lineTo(151, 24); context.moveTo(143, 65); context.lineTo(148, 65); context.stroke();
      context.fillStyle = "#f5bc30";
      for (const [cx, cy] of [[140,36],[151,36],[140,47],[151,47]]) { context.beginPath(); context.arc(cx, cy, 2.5, 0, Math.PI * 2); context.fill(); }
    } else if (workshopCode === "gdevelop") {
      context.beginPath();
      context.moveTo(130, 34); context.quadraticCurveTo(130, 26, 138, 26); context.lineTo(152, 26); context.quadraticCurveTo(160, 26, 162, 34); context.lineTo(166, 55); context.quadraticCurveTo(167, 64, 159, 64); context.lineTo(149, 56); context.lineTo(140, 56); context.lineTo(132, 64); context.quadraticCurveTo(124, 64, 126, 55); context.closePath(); context.stroke();
      context.beginPath(); context.moveTo(137, 39); context.lineTo(147, 39); context.moveTo(142, 34); context.lineTo(142, 44); context.stroke();
      context.beginPath(); context.arc(153, 38, 2.5, 0, Math.PI * 2); context.arc(158, 45, 2.5, 0, Math.PI * 2); context.fill();
    } else if (workshopCode === "git-github") {
      context.beginPath(); context.moveTo(135, 24); context.lineTo(151, 40); context.lineTo(135, 57); context.moveTo(151, 40); context.lineTo(160, 40); context.stroke();
      for (const [cx, cy] of [[135,24],[135,57],[151,40],[160,40]]) { context.beginPath(); context.arc(cx, cy, 5, 0, Math.PI * 2); context.stroke(); }
    } else {
      context.beginPath(); context.arc(144, 42, 20, 0, Math.PI * 2); context.stroke();
      context.beginPath(); context.moveTo(124, 42); context.lineTo(164, 42); context.moveTo(144, 22); context.lineTo(144, 62); context.stroke();
      context.beginPath(); context.arc(144, 42, 8, 0, Math.PI * 2); context.stroke();
    }
    context.restore();
  }

  function drawPortrait(context, workshop, x, y, width, height, radius) {
    context.save();
    context.shadowColor = "rgba(11,49,92,.22)";
    context.shadowBlur = 32;
    context.shadowOffsetY = 14;
    context.fillStyle = "#ffffff";
    roundedRect(context, x - 11, y - 11, width + 22, height + 22, radius + 10);
    context.fill();
    context.restore();
    const image = participantPhoto || workshopArtwork.get(workshop.value);
    if (image?.naturalWidth) {
      cropImage(context, image, x, y, width, height, radius);
    } else {
      const gradient = context.createLinearGradient(x, y, x + width, y + height);
      gradient.addColorStop(0, "#176d9d");
      gradient.addColorStop(.55, "#74d0dc");
      gradient.addColorStop(1, "#f5bc30");
      context.fillStyle = gradient;
      roundedRect(context, x, y, width, height, radius);
      context.fill();
    }
    if (!participantPhoto) {
      context.save();
      roundedRect(context, x, y, width, height, radius);
      context.clip();
      const fade = context.createLinearGradient(0, y + height * .68, 0, y + height);
      fade.addColorStop(0, "rgba(11,49,92,0)");
      fade.addColorStop(1, "rgba(11,49,92,.72)");
      context.fillStyle = fade;
      context.fillRect(x, y + height * .66, width, height * .34);
      context.restore();
      context.fillStyle = "#ffffff";
      context.font = "800 17px Inter, Arial, sans-serif";
      context.textAlign = "left";
      context.fillText("VISUEL DE L’ATELIER", x + 20, y + height - 22);
    }
  }

  function drawSquare(workshop, title, name) {
    const width = 1080;
    const height = 1080;
    drawBackdrop(width, height);
    ctx.fillStyle = "#0b315c";
    ctx.fillRect(0, 0, width, 232);
    drawBrand(ctx, width, 34, true);
    drawTechGlyphs(ctx, 858, 43, .9, workshop.value);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 59px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("I WILL BE THERE", width / 2, 204);

    drawPortrait(ctx, workshop, 72, 280, 390, 500, 30);
    ctx.textAlign = "left";
    ctx.fillStyle = "#147da0";
    ctx.font = "850 21px Inter, Arial, sans-serif";
    ctx.fillText("JE M’APPELLE", 510, 356);
    const nameSize = fittedFont(ctx, name, 500, 78, 48, 900);
    ctx.font = `900 ${nameSize}px Inter, "Arial", sans-serif`;
    drawWrapped(ctx, name, 510, 455, 500, 82, 2, nameSize, "#0b315c");
    ctx.fillStyle = "#87dfe6";
    roundedRect(ctx, 510, 540, 92, 7, 4);
    ctx.fill();
    ctx.fillStyle = "#55728a";
    ctx.font = "800 18px Inter, Arial, sans-serif";
    ctx.fillText("À L’ATELIER", 510, 604);
    const workshopSize = fittedFont(ctx, title, 500, 40, 25, 850);
    ctx.font = `850 ${workshopSize}px Inter, "Arial", sans-serif`;
    drawWrapped(ctx, title, 510, 664, 500, 48, 2, workshopSize, "#0b315c");

    ctx.fillStyle = "#f5bc30";
    roundedRect(ctx, 72, 822, 936, 142, 24);
    ctx.fill();
    ctx.fillStyle = "#0b315c";
    ctx.textAlign = "left";
    ctx.font = "850 19px Inter, Arial, sans-serif";
    ctx.fillText("DATES ET LIEU À CONFIRMER", 106, 880);
    ctx.font = "700 22px Inter, Arial, sans-serif";
    ctx.fillText("Votre présence commence ici.", 106, 922);

    ctx.fillStyle = "#0b315c";
    ctx.fillRect(0, 1004, width, 76);
    ctx.fillStyle = "#ffffff";
    ctx.font = "750 19px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("APPRENDRE  ·  EXPÉRIMENTER  ·  CRÉER", width / 2, 1051);
    ctx.textAlign = "left";
  }

  function drawStory(workshop, title, name) {
    const width = 1080;
    const height = 1920;
    drawBackdrop(width, height);
    ctx.fillStyle = "#0b315c";
    ctx.fillRect(0, 0, width, 284);
    drawBrand(ctx, width, 38, false);
    drawTechGlyphs(ctx, 850, 50, 1, workshop.value);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 66px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("I WILL BE THERE", width / 2, 250);

    drawPortrait(ctx, workshop, 108, 332, 864, 790, 38);
    ctx.fillStyle = "#147da0";
    ctx.font = "850 22px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("JE M’APPELLE", width / 2, 1195);
    const nameSize = fittedFont(ctx, name, 930, 94, 58, 900);
    ctx.font = `900 ${nameSize}px Inter, "Arial", sans-serif`;
    const nameLines = drawWrapped(ctx, name, width / 2, 1302, 930, 92, 2, nameSize, "#0b315c");

    const panelY = nameLines > 1 ? 1505 : 1460;
    ctx.fillStyle = "#f5bc30";
    roundedRect(ctx, 80, panelY, 920, 248, 28);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.fillStyle = "#0b315c";
    ctx.font = "850 23px Inter, Arial, sans-serif";
    ctx.fillText("MON ATELIER", 132, panelY + 65);
    const workshopSize = fittedFont(ctx, title, 810, 43, 28, 850);
    ctx.font = `850 ${workshopSize}px Inter, "Arial", sans-serif`;
    drawWrapped(ctx, title, 132, panelY + 132, 810, 52, 2, workshopSize, "#0b315c");
    ctx.fillStyle = "#3b5b72";
    ctx.font = "750 18px Inter, Arial, sans-serif";
    ctx.fillText("DATES ET LIEU À CONFIRMER", 132, panelY + 212);

    ctx.fillStyle = "#0b315c";
    ctx.fillRect(0, 1824, width, 96);
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 24px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("APPRENDRE  ·  EXPÉRIMENTER  ·  CRÉER", width / 2, 1864);
    ctx.fillStyle = "#a8eaf0";
    ctx.font = "700 17px Inter, Arial, sans-serif";
    ctx.fillText("ATELIERS ICT4D · UNIVERSITÉ DE YAOUNDÉ I", width / 2, 1898);
    ctx.textAlign = "left";
  }

  function render() {
    if (!ctx) return;
    updateDefaultCaption();
    const workshop = selectedWorkshop();
    const title = workshop.title;
    const name = clean(nameInput?.value) || "Votre nom ici";
    if (selectedFormat === "story") {
      canvas.width = 1080;
      canvas.height = 1920;
      frame?.classList.remove("is-square");
      frame?.classList.add("is-story");
      canvas.setAttribute("aria-label", "Aperçu Story de la carte de présence ICT4D");
      drawStory(workshop, title, name);
    } else {
      canvas.width = 1080;
      canvas.height = 1080;
      frame?.classList.remove("is-story");
      frame?.classList.add("is-square");
      canvas.setAttribute("aria-label", "Aperçu carré de la carte de présence ICT4D");
      drawSquare(workshop, title, name);
    }
    if (previewStatus) previewStatus.textContent = "Aperçu actualisé dans votre navigateur. Aucune donnée personnelle n’a été envoyée.";
  }

  function loadWorkshopImage(key, source) {
    const code = clean(key);
    const path = clean(source);
    if (!code || !/^\/assets\/[A-Za-z0-9][A-Za-z0-9._-]{0,200}[.](?:png|jpe?g|webp)$/i.test(path)) return;
    const image = new Image();
    image.onload = render;
    image.src = path;
    workshopArtwork.set(code, image);
  }

  function loadArtwork() {
    if (!brandLogo.complete) brandLogo.onload = render;
    for (const [key, source] of Object.entries(workshopImages)) {
      loadWorkshopImage(key, source);
    }
    fetch("/api/workshops", { headers: { Accept: "application/json" }, credentials: "same-origin", cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => {
        if (!result?.ok || !Array.isArray(result.workshops)) return;
        for (const workshop of result.workshops) loadWorkshopImage(workshop.registration_code, workshop.image_path);
      })
      .catch(() => {});
  }

  function makePngFile() {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Le fichier PNG ne peut pas être créé."));
          return;
        }
        const suffix = selectedFormat === "story" ? "story" : "carree";
        resolve(new File([blob], `carte-ict4d-${suffix}.png`, { type: "image/png" }));
      }, "image/png");
    });
  }

  function savePng() {
    canvas.toBlob((blob) => {
      if (!blob) {
        if (previewStatus) previewStatus.textContent = "Le téléchargement n’a pas abouti. Réessayez.";
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `carte-ict4d-${selectedFormat === "story" ? "story" : "carree"}.png`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1200);
      if (previewStatus) previewStatus.textContent = "Votre PNG a été préparé localement et téléchargé.";
    }, "image/png");
  }

  document.querySelector("#download-presence-card")?.addEventListener("click", savePng);
  nameInput?.addEventListener("input", render);
  workshopInput?.addEventListener("change", render);
  captionInput?.addEventListener("input", () => {
    captionWasEdited = true;
    if (captionStatus) captionStatus.textContent = "";
  });
  formatButtons.forEach((button) => button.addEventListener("click", () => {
    selectedFormat = button.dataset.format === "story" ? "story" : "square";
    formatButtons.forEach((choice) => {
      const active = choice === button;
      choice.classList.toggle("is-active", active);
      choice.setAttribute("aria-pressed", String(active));
    });
    render();
  }));

  document.querySelector("#copy-caption")?.addEventListener("click", async () => {
    const caption = clean(captionInput?.value);
    if (!caption) {
      if (captionStatus) captionStatus.textContent = "Saisissez une légende avant de la copier.";
      captionInput?.focus();
      return;
    }
    try {
      await navigator.clipboard.writeText(caption);
      if (captionStatus) captionStatus.textContent = "Légende copiée.";
    } catch {
      if (captionInput) {
        captionInput.focus();
        captionInput.select();
      }
      if (captionStatus) captionStatus.textContent = "Sélectionnez la légende puis copiez-la.";
    }
  });

  photoInput?.addEventListener("change", () => {
    const file = photoInput.files?.[0];
    participantPhoto = null;
    if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
    photoObjectUrl = "";
    if (!file) {
      render();
      return;
    }
    if (!file.type.startsWith("image/")) {
      if (previewStatus) previewStatus.textContent = "Choisissez un fichier image. Aucune donnée n’a été envoyée.";
      photoInput.value = "";
      render();
      return;
    }
    photoObjectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      participantPhoto = image;
      render();
    };
    image.onerror = () => {
      if (previewStatus) previewStatus.textContent = "Cette image ne peut pas être affichée. Elle n’a pas quitté votre appareil.";
      photoInput.value = "";
      render();
    };
    image.src = photoObjectUrl;
  });

  const shareButton = document.querySelector("#share-presence-card");
  if (shareButton && typeof navigator.share === "function") shareButton.hidden = false;
  shareButton?.addEventListener("click", async () => {
    try {
      const file = await makePngFile();
      const caption = clean(captionInput?.value) || "I will be there — Ateliers ICT4D, Université de Yaoundé I";
      const shareData = { title: "Ma carte ICT4D", text: caption, files: [file] };
      if (navigator.canShare && !navigator.canShare({ files: [file] })) {
        if (previewStatus) previewStatus.textContent = "Le partage de fichier n’est pas disponible dans cette application. Téléchargez le PNG pour le partager.";
        return;
      }
      await navigator.share(shareData);
      if (previewStatus) previewStatus.textContent = "Carte partagée selon votre choix.";
    } catch (error) {
      if (error?.name !== "AbortError" && previewStatus) previewStatus.textContent = "Le partage n’a pas abouti. Vous pouvez télécharger la carte PNG.";
    }
  });

  window.addEventListener("beforeunload", () => {
    if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
  });
  loadArtwork();
  render();
})();
