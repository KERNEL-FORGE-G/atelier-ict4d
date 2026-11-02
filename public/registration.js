(() => {
  const form = document.querySelector("#registration-form");
  if (!form || form.dataset.registrationMode !== "multi") return;

  const options = document.querySelector("#workshop-options");
  const selectionMessage = document.querySelector("#workshop-selection-message");
  const message = document.querySelector("#form-message");
  const successCard = document.querySelector("#success-card");
  const successWorkshops = document.querySelector("#success-workshops");
  const submitButton = form.querySelector(".submit-button");
  const submitLabel = form.querySelector(".submit-label");
  const requestedWorkshop = new URLSearchParams(window.location.search).get("workshop") || "";
  const requestedInput = [...(options?.querySelectorAll('input[name="workshops"]') || [])].find((input) => input.value === requestedWorkshop);
  if (requestedInput) requestedInput.checked = true;

  function checkedWorkshops() {
    return [...(options?.querySelectorAll('input[name="workshops"]:checked') || [])];
  }

  function checkSelection(selected = checkedWorkshops()) {
    if (!selected.length) return { ok: false, message: "Cochez au moins un atelier." };
    if (selected.length > 1 && selected.some((input) => !input.dataset.scheduleDate || !input.dataset.startTime || !input.dataset.endTime)) {
      return { ok: false, message: "Les horaires de tous les ateliers doivent être confirmés avant de les combiner. Pour l’instant, sélectionnez un seul atelier." };
    }
    const intervals = selected.map((input) => ({
      input,
      start: `${input.dataset.scheduleDate || ""}T${input.dataset.startTime || ""}`,
      end: `${input.dataset.scheduleDate || ""}T${input.dataset.endTime || ""}`
    }));
    for (let left = 0; left < intervals.length; left += 1) {
      for (let right = left + 1; right < intervals.length; right += 1) {
        if (intervals[left].start < intervals[right].end && intervals[left].end > intervals[right].start) {
          return { ok: false, message: "Deux ateliers se déroulent sur le même créneau. Choisissez-en un seul parmi eux." };
        }
      }
    }
    return { ok: true, message: selected.length === 1 ? "Un atelier est sélectionné." : `${selected.length} ateliers sélectionnés; aucun chevauchement détecté.` };
  }

  function updateSelectionState() {
    const result = checkSelection();
    if (selectionMessage) {
      selectionMessage.textContent = result.message;
      selectionMessage.className = `form-message${result.ok ? "" : checkedWorkshops().length ? " error" : ""}`;
    }
    if (submitButton) submitButton.disabled = !result.ok;
  }

  options?.addEventListener("change", updateSelectionState);
  updateSelectionState();

  function showMessage(text, kind = "") {
    if (!message) return;
    message.textContent = text;
    message.className = `form-message${kind ? ` ${kind}` : ""}`;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const selected = checkedWorkshops();
    const selection = checkSelection(selected);
    if (!selection.ok) {
      updateSelectionState();
      options?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const values = new FormData(form);
    const payload = {
      full_name: String(values.get("full_name") || "").trim(),
      email: String(values.get("email") || "").trim().toLowerCase(),
      level: String(values.get("level") || ""),
      workshops: selected.map((input) => input.value),
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
        if (successWorkshops) {
          successWorkshops.replaceChildren();
          for (const input of selected) {
            const item = document.createElement("li");
            item.textContent = input.closest(".workshop-choice")?.querySelector("strong")?.textContent || input.value;
            successWorkshops.append(item);
          }
        }
        form.hidden = true;
        if (successCard) successCard.hidden = false;
        return;
      }
      if (response.status === 409 || result.reason === "duplicate") {
        showMessage("Une préinscription existe déjà pour cette adresse e-mail. Une seule fiche est conservée par personne.", "error");
      } else if (response.status === 429) {
        showMessage("Trop de demandes rapprochées. Réessayez dans quelques instants.", "error");
      } else if (response.status === 400) {
        const reasons = {
          schedule_missing: "Plusieurs ateliers ne peuvent être combinés tant que tous leurs horaires ne sont pas confirmés.",
          schedule_conflict: "Deux ateliers sélectionnés se chevauchent. Choisissez un seul atelier pour ce créneau.",
          unknown_workshop: "Un atelier sélectionné n’est plus disponible. Actualisez la page puis réessayez.",
          invalid_selection: "Choisissez au moins un atelier publié."
        };
        showMessage(result.message || reasons[result.reason] || "Vérifiez les champs du formulaire puis réessayez.", "error");
      } else {
        showMessage("L’envoi n’a pas abouti. Réessayez dans quelques instants.", "error");
      }
    } catch {
      showMessage("Connexion indisponible. Vérifiez votre réseau puis réessayez.", "error");
    } finally {
      if (submitLabel) submitLabel.textContent = "Envoyer ma fiche unique";
      updateSelectionState();
    }
  });
})();
