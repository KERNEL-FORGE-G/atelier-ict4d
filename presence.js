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
    "git-github": "/assets/illustration-git-github-web.jpg"
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
    captionInput.value = `J’y serai ! Prêt·e à apprendre et créer à l’atelier ${title} des ateliers ICT4D.`;
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
    const x = compact ? 62 : 72;
    const size = compact ? 74 : 86;
    context.save();
    context.fillStyle = "#ffffff";
    roundedRect(context, x, y, size, size, 13);
    context.fill();
    roundedRect(context, x, y, size, size, 13);
    context.clip();
    if (brandLogo.naturalWidth) context.drawImage(brandLogo, x + 2, y + 2, size - 4, size - 4);
    context.restore();
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillStyle = "#ffffff";
    context.font = `850 ${compact ? 26 : 30}px Inter, Arial, sans-serif`;
    context.fillText("ATELIERS ICT4D", x + size + 17, y + size * 0.38);
    context.fillStyle = "#91e3e8";
    context.font = `750 ${compact ? 16 : 18}px Inter, Arial, sans-serif`;
    context.fillText("UNIVERSITÉ DE YAOUNDÉ I", x + size + 17, y + size * 0.72);
    context.textBaseline = "alphabetic";
  }

  function drawTechGlyphs(context, x, y, scale = 1) {
    context.save();
    context.translate(x, y);
    context.scale(scale, scale);
    context.strokeStyle = "rgba(145,227,232,.78)";
    context.fillStyle = "rgba(245,188,48,.96)";
    context.lineWidth = 4;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(0, 38); context.lineTo(33, 38); context.lineTo(52, 17); context.lineTo(84, 17);
    context.moveTo(33, 38); context.lineTo(52, 61); context.lineTo(84, 61);
    context.stroke();
    for (const [cx, cy] of [[0,38],[84,17],[84,61]]) {
      context.beginPath(); context.arc(cx, cy, 7, 0, Math.PI * 2); context.fill();
    }
    context.restore();
  }

  function drawPortrait(context, workshop, x, y, width, height, radius) {
    context.save();
    context.shadowColor = "rgba(11,49,92,.18)";
    context.shadowBlur = 34;
    context.shadowOffsetY = 18;
    context.fillStyle = "#ffffff";
    roundedRect(context, x - 12, y - 12, width + 24, height + 24, radius + 11);
    context.fill();
    context.restore();
    const image = participantPhoto || workshopArtwork.get(workshop.value);
    if (image?.naturalWidth) {
      cropImage(context, image, x, y, width, height, radius);
      if (!participantPhoto) {
        context.fillStyle = "rgba(11,49,92,.20)";
        context.save();
        roundedRect(context, x, y, width, height, radius);
        context.clip();
        context.fillRect(x, y, width, height);
        context.restore();
      }
    } else {
      const gradient = context.createLinearGradient(x, y, x + width, y + height);
      gradient.addColorStop(0, "#29a8c9");
      gradient.addColorStop(.52, "#d6f3f4");
      gradient.addColorStop(1, "#f6c743");
      context.fillStyle = gradient;
      roundedRect(context, x, y, width, height, radius);
      context.fill();
      context.fillStyle = "rgba(11,49,92,.12)";
      context.beginPath();
      context.arc(x + width * .5, y + height * .43, width * .19, Math.PI, Math.PI * 2);
      context.fill();
      context.fillRect(x, y + height * .56, width, height * .44);
    }
    if (!participantPhoto) {
      context.fillStyle = "#ffffff";
      context.font = "800 20px Inter, Arial, sans-serif";
      context.textAlign = "center";
      context.fillText("PHOTO FACULTATIVE", x + width / 2, y + height - 30);
      context.textAlign = "left";
    }
  }

  function drawSquare(workshop, title, name) {
    const width = 1080;
    const height = 1080;
    drawBackdrop(width, height);
    ctx.fillStyle = "#0b315c";
    ctx.fillRect(0, 0, width, 252);
    drawBrand(ctx, width, 34, true);
    drawTechGlyphs(ctx, 910, 72, 0.9);
    ctx.fillStyle = "#91e3e8";
    const squareSchedule = workshop.schedule || "ATELIERS PRATIQUES · DATES À VENIR";
    ctx.font = `800 ${fittedFont(ctx, squareSchedule, 900, 19, 13, 800)}px Inter, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(squareSchedule.toLocaleUpperCase("fr"), width / 2, 154);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 66px Inter, Arial, sans-serif";
    ctx.fillText("I WILL BE THERE", width / 2, 224);

    drawPortrait(ctx, workshop, 364, 286, 352, 394, 30);
    ctx.fillStyle = "#2d607f";
    ctx.font = "800 20px Inter, Arial, sans-serif";
    ctx.fillText("JE M’APPELLE", width / 2, 721);
    const nameSize = fittedFont(ctx, name, 880, 68, 42, 900);
    ctx.font = `900 ${nameSize}px Inter, "Arial", sans-serif`;
    const nameLines = drawWrapped(ctx, name, width / 2, 804, 880, 62, 2, nameSize, "#0b315c");

    const panelY = nameLines > 1 ? 858 : 836;
    ctx.fillStyle = "#f5bc30";
    roundedRect(ctx, 128, panelY, 824, 151, 24);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.fillStyle = "#0b315c";
    ctx.font = "850 18px Inter, Arial, sans-serif";
    ctx.fillText("MON ATELIER", 170, panelY + 43);
    const workshopSize = fittedFont(ctx, title, 742, 34, 23, 850);
    ctx.font = `850 ${workshopSize}px Inter, "Arial", sans-serif`;
    drawWrapped(ctx, title, 170, panelY + 96, 742, 42, 2, workshopSize, "#0b315c");

    ctx.fillStyle = "#0b315c";
    ctx.fillRect(0, 1018, width, 62);
    ctx.fillStyle = "#ffffff";
    ctx.font = "750 18px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("APPRENDRE  ·  EXPÉRIMENTER  ·  CRÉER", width / 2, 1057);
    ctx.textAlign = "left";
  }

  function drawStory(workshop, title, name) {
    const width = 1080;
    const height = 1920;
    drawBackdrop(width, height);
    ctx.fillStyle = "#0b315c";
    ctx.fillRect(0, 0, width, 348);
    drawBrand(ctx, width, 36, false);
    drawTechGlyphs(ctx, 916, 82, 1.12);
    ctx.fillStyle = "#91e3e8";
    const storySchedule = workshop.schedule || "ATELIERS PRATIQUES · DATES À VENIR";
    ctx.font = `800 ${fittedFont(ctx, storySchedule, 930, 23, 15, 800)}px Inter, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(storySchedule.toLocaleUpperCase("fr"), width / 2, 190);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 72px Inter, Arial, sans-serif";
    ctx.fillText("I WILL BE THERE", width / 2, 294);

    drawPortrait(ctx, workshop, 164, 392, 752, 860, 38);
    ctx.fillStyle = "#2d607f";
    ctx.font = "800 23px Inter, Arial, sans-serif";
    ctx.fillText("JE M’APPELLE", width / 2, 1330);
    const nameSize = fittedFont(ctx, name, 940, 92, 58, 900);
    ctx.font = `900 ${nameSize}px Inter, "Arial", sans-serif`;
    const nameLines = drawWrapped(ctx, name, width / 2, 1440, 940, 80, 2, nameSize, "#0b315c");

    const panelY = nameLines > 1 ? 1584 : 1555;
    ctx.fillStyle = "#f5bc30";
    roundedRect(ctx, 82, panelY, 916, 218, 27);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.fillStyle = "#0b315c";
    ctx.font = "850 22px Inter, Arial, sans-serif";
    ctx.fillText("MON ATELIER", 126, panelY + 56);
    const workshopSize = fittedFont(ctx, title, 824, 40, 27, 850);
    ctx.font = `850 ${workshopSize}px Inter, "Arial", sans-serif`;
    drawWrapped(ctx, title, 126, panelY + 130, 824, 48, 2, workshopSize, "#0b315c");

    ctx.fillStyle = "#0b315c";
    ctx.fillRect(0, 1824, width, 96);
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 24px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("APPRENDRE  ·  EXPÉRIMENTER  ·  CRÉER", width / 2, 1865);
    ctx.fillStyle = "#91e3e8";
    ctx.font = "700 17px Inter, Arial, sans-serif";
    ctx.fillText("ICT4D · UNIVERSITÉ DE YAOUNDÉ I", width / 2, 1898);
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

  function loadArtwork() {
    if (!brandLogo.complete) brandLogo.onload = render;
    for (const [key, source] of Object.entries(workshopImages)) {
      const image = new Image();
      image.onload = render;
      image.src = source;
      workshopArtwork.set(key, image);
    }
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
