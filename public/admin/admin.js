(() => {
  "use strict";

  const PAGE_SIZE = 100;
  const UI_PAGE_SIZE = 25;
  const PAGE_DELAY_MS = 1700;
  const loginPanel = document.querySelector("#login-panel");
  const dashboard = document.querySelector("#dashboard");
  const loginForm = document.querySelector("#login-form");
  const loginMessage = document.querySelector("#login-message");
  const dashboardMessage = document.querySelector("#dashboard-message");
  const rowsNode = document.querySelector("#registration-rows");
  const emptyState = document.querySelector("#empty-state");
  const pageCount = document.querySelector("#page-count");
  const workshopFilter = document.querySelector("#workshop-filter");
  const statusFilter = document.querySelector("#status-filter");
  const searchFilter = document.querySelector("#search-filter");
  const registrationDateFrom = document.querySelector("#registration-date-from");
  const registrationDateTo = document.querySelector("#registration-date-to");
  const reportDateInput = document.querySelector("#report-date");
  const loadingArea = document.querySelector("#loading-area");
  const loadingLabel = document.querySelector("#loading-label");
  const loadingCount = document.querySelector("#loading-count");
  const loadingProgress = document.querySelector("#loading-progress");
  const exportButton = document.querySelector("#export-button");

  const workshopNames = {
    general: "Ateliers ICT4D",
    ict4d: "Numérique et développement (ICT4D)",
    gdevelop: "Jeu vidéo avec GDevelop",
    "git-github": "Gestion de projet avec Git/GitHub"
  };
  const statusNames = {
    new: "Nouvelle",
    reviewed: "Consultée",
    accepted: "Acceptée",
    waitlisted: "Liste d’attente",
    rejected: "Refusée"
  };
  function registrationWorkshopCodes(row) {
    const values = Array.isArray(row.workshops) ? row.workshops : [];
    return [...new Set([...values, row.workshop].filter((value) => typeof value === "string" && value))];
  }
  function registrationWorkshopLabel(row) {
    return registrationWorkshopCodes(row).map((code) => workshopNames[code] || code).join(", ") || "—";
  }

  let registrations = [];
  let currentPage = 0;
  let dashboardBusy = false;
  let searchTimer;

  function setMessage(node, text, ok = false) {
    if (!node) return;
    node.textContent = text;
    node.className = `message${ok ? " ok" : ""}${node === dashboardMessage ? " dashboard-message" : ""}`;
  }

  async function api(path = "", options = {}) {
    const response = await fetch(`/api/admin${path}`, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  function showLogin(message = "") {
    if (loginPanel) loginPanel.hidden = false;
    if (dashboard) dashboard.hidden = true;
    setMessage(loginMessage, message);
    setBusy(false);
  }

  function showDashboard() {
    if (loginPanel) loginPanel.hidden = true;
    if (dashboard) dashboard.hidden = false;
  }

  function setBusy(busy) {
    dashboardBusy = busy;
    if (exportButton) exportButton.disabled = busy;
    const refresh = document.querySelector("#refresh-button");
    if (refresh) refresh.disabled = busy;
  }

  function tableCell(value, className = "") {
    const cell = document.createElement("td");
    if (className) cell.className = className;
    cell.textContent = value;
    return cell;
  }

  function formatDate(value, includeTime = true) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      ...(includeTime ? { timeStyle: "short" } : {}),
      timeZone: "Africa/Douala"
    }).format(date);
  }

  function formatWorkshopSchedule(item) {
    const parts = [];
    const date = typeof item.schedule_date === "string" ? item.schedule_date : "";
    const start = typeof item.start_time === "string" ? item.start_time.slice(0, 5) : "";
    const end = typeof item.end_time === "string" ? item.end_time.slice(0, 5) : "";
    const room = typeof item.room === "string" ? item.room.trim() : "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const [year, month, day] = date.split("-").map(Number);
      parts.push(new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day))));
    }
    if (start && end) parts.push(`${start}–${end} · heure de Yaoundé`);
    if (room) parts.push(`Salle ${room}`);
    return parts.join(" · ");
  }

  function doualaDateParts(date) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Douala", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(date);
    return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  }

  function doualaDateInputValue(date = new Date()) {
    const parts = doualaDateParts(date);
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function timezoneOffsetAt(timestamp, timeZone = "Africa/Douala") {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
    }).formatToParts(new Date(timestamp));
    const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
    return Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second) - timestamp;
  }

  function doualaDateBoundary(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
    if (!match) return null;
    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText), month = Number(monthText), day = Number(dayText);
    const utcNoon = Date.UTC(year, month - 1, day, 12);
    const check = new Date(utcNoon);
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
    const utcMidnight = Date.UTC(year, month - 1, day);
    return utcMidnight - timezoneOffsetAt(utcNoon);
  }

  function registrationMatchesDateRange(value, dateFrom = "", dateTo = "") {
    if (!dateFrom && !dateTo) return true;
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return false;
    const start = dateFrom ? doualaDateBoundary(dateFrom) : null;
    const end = dateTo ? doualaDateBoundary(dateTo) : null;
    if ((dateFrom && start === null) || (dateTo && end === null)) return false;
    if (start !== null && end !== null && start > end) return false;
    if (start !== null && timestamp < start) return false;
    if (end !== null) {
      const [year, month, day] = dateTo.split("-").map(Number);
      const nextNoon = Date.UTC(year, month - 1, day + 1, 12);
      const nextDay = new Date(nextNoon);
      const nextMidnight = Date.UTC(nextDay.getUTCFullYear(), nextDay.getUTCMonth(), nextDay.getUTCDate());
      if (timestamp >= nextMidnight - timezoneOffsetAt(nextNoon)) return false;
    }
    return true;
  }

  function registrationMatches(row, filters = readFilters()) {
    const workshopCodes = registrationWorkshopCodes(row);
    if (filters.workshop && !workshopCodes.includes(filters.workshop)) return false;
    if (filters.status && row.status !== filters.status) return false;
    if (!registrationMatchesDateRange(row.created_at, filters.dateFrom, filters.dateTo)) return false;
    if (filters.query) {
      const searchable = [row.full_name, row.email, row.level, registrationWorkshopLabel(row), statusNames[row.status]]
        .filter(Boolean).join(" ").toLocaleLowerCase("fr");
      if (!searchable.includes(filters.query)) return false;
    }
    return true;
  }

  function readFilters() {
    return {
      workshop: workshopFilter?.value || "",
      status: statusFilter?.value || "",
      query: (searchFilter?.value || "").trim().toLocaleLowerCase("fr"),
      dateFrom: registrationDateFrom?.value || "",
      dateTo: registrationDateTo?.value || ""
    };
  }

  function getFilteredRows(filters = readFilters()) {
    return registrations.filter((row) => registrationMatches(row, filters));
  }

  function updateStats() {
    const stats = {
      "#stat-total": registrations.length,
      "#stat-new": registrations.filter((row) => row.status === "new").length,
      "#stat-accepted": registrations.filter((row) => row.status === "accepted").length,
      "#stat-waitlisted": registrations.filter((row) => row.status === "waitlisted").length
    };
    for (const [selector, value] of Object.entries(stats)) {
      const node = document.querySelector(selector);
      if (node) node.textContent = String(value);
    }
  }

  function renderTable() {
    const filtered = getFilteredRows();
    const totalPages = Math.max(1, Math.ceil(filtered.length / UI_PAGE_SIZE));
    currentPage = Math.min(currentPage, totalPages - 1);
    const start = currentPage * UI_PAGE_SIZE;
    const pageRows = filtered.slice(start, start + UI_PAGE_SIZE);
    rowsNode?.replaceChildren();

    for (const registration of pageRows) {
      const row = document.createElement("tr");
      row.append(
        tableCell(formatDate(registration.created_at)),
        tableCell(registration.full_name || "—"),
        tableCell(registration.email || "—", "email-cell"),
        tableCell(registration.level || "—"),
        tableCell(registrationWorkshopLabel(registration))
      );

      const statusCell = document.createElement("td");
      const select = document.createElement("select");
      select.setAttribute("aria-label", `Statut de ${registration.full_name || "l’inscription"}`);
      for (const [value, label] of Object.entries(statusNames)) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        select.append(option);
      }
      select.value = statusNames[registration.status] ? registration.status : "new";
      select.addEventListener("change", async () => {
        const previousStatus = registration.status || "new";
        const newStatus = select.value;
        select.disabled = true;
        try {
          const result = await api("", {
            method: "PATCH",
            body: JSON.stringify({ action: "update-status", id: registration.id, status: newStatus })
          });
          if (result.response.status === 401) {
            showLogin("Votre session a expiré. Reconnectez-vous.");
            return;
          }
          if (!result.response.ok || !result.data.ok) {
            setMessage(dashboardMessage, "Le statut n’a pas pu être modifié.");
            select.value = previousStatus;
            return;
          }
          registration.status = newStatus;
          updateStats();
          renderTable();
          setMessage(dashboardMessage, "Statut mis à jour.", true);
        } catch {
          select.value = previousStatus;
          setMessage(dashboardMessage, "Connexion indisponible. Le statut n’a pas été modifié.");
        } finally {
          if (select.isConnected) select.disabled = false;
        }
      });
      statusCell.append(select);
      row.append(statusCell);
      rowsNode?.append(row);
    }

    if (emptyState) emptyState.hidden = filtered.length > 0;
    const hasAny = registrations.length > 0;
    const emptyTitle = document.querySelector("#empty-title");
    const emptyCopy = document.querySelector("#empty-copy");
    if (emptyTitle) emptyTitle.textContent = hasAny ? "Aucun résultat" : "Aucune préinscription";
    if (emptyCopy) emptyCopy.textContent = hasAny
      ? "Aucune demande ne correspond à ces filtres. Essayez de les modifier."
      : "Aucune demande n’a encore été reçue.";

    const resultsCount = document.querySelector("#results-count");
    if (resultsCount) {
      resultsCount.textContent = `${filtered.length} résultat${filtered.length > 1 ? "s" : ""} sur ${registrations.length}`;
    }
    const indicator = document.querySelector("#page-indicator");
    if (indicator) indicator.textContent = `Page ${currentPage + 1} / ${totalPages}`;
    const previousButton = document.querySelector("#previous-button");
    const nextButton = document.querySelector("#next-button");
    if (previousButton) previousButton.disabled = currentPage === 0;
    if (nextButton) nextButton.disabled = currentPage >= totalPages - 1;
    if (pageCount && activeTab === "participants") pageCount.textContent = registrations.length
      ? `${registrations.length} préinscription${registrations.length === 1 ? "" : "s"} chargée${registrations.length === 1 ? "" : "s"}`
      : "Aucune préinscription pour le moment.";
    updateTabCounts();
  }

  function showProgress(label, count = 0, batchNumber = 0) {
    if (!loadingArea) return;
    loadingArea.hidden = false;
    if (loadingLabel) loadingLabel.textContent = label;
    if (loadingCount) loadingCount.textContent = count ? `${count} ligne${count === 1 ? "" : "s"}` : "";
    if (loadingProgress) {
      loadingProgress.value = batchNumber ? Math.min(95, batchNumber * 8) : 0;
      loadingProgress.setAttribute("aria-valuetext", `${count} lignes chargées`);
    }
  }

  function hideProgress() {
    if (loadingArea) loadingArea.hidden = true;
  }

  function pause(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function fetchAllRegistrations(label) {
    const allRows = [];
    let offset = 0;
    let batchNumber = 0;
    while (true) {
      batchNumber += 1;
      showProgress(`${label} · lot ${batchNumber}`, allRows.length, batchNumber);
      const { response, data } = await api(`?limit=${PAGE_SIZE}&offset=${offset}`);
      if (response.status === 401) {
        showLogin("Votre session a expiré. Reconnectez-vous.");
        return null;
      }
      if (!response.ok || !Array.isArray(data)) {
        throw new Error("La liste n’a pas pu être chargée.");
      }
      allRows.push(...data);
      showProgress(`${label} · lot ${batchNumber}`, allRows.length, batchNumber);
      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
      await pause(PAGE_DELAY_MS);
    }
    if (loadingProgress) loadingProgress.value = 100;
    return allRows;
  }

  async function loadRegistrations() {
    if (dashboardBusy) return;
    setBusy(true);
    setMessage(dashboardMessage, "");
    if (pageCount) pageCount.textContent = "Chargement des préinscriptions…";
    showProgress("Chargement des préinscriptions", 0, 0);
    try {
      const allRows = await fetchAllRegistrations("Chargement des préinscriptions");
      if (allRows === null) return;
      registrations = allRows;
      currentPage = 0;
      updateStats();
      renderTable();
      setMessage(dashboardMessage, "Liste actualisée.", true);
    } catch {
      setMessage(dashboardMessage, "Impossible de charger la liste. Vérifiez votre connexion puis réessayez.");
      if (pageCount) pageCount.textContent = "La liste n’a pas pu être chargée.";
    } finally {
      hideProgress();
      setBusy(false);
    }
  }

  function filenameSafeDate(date) {
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Douala", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  }

  function doualaTimestamp(date) {
    return new Intl.DateTimeFormat("fr-FR", {
      year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
      timeZone: "Africa/Douala", timeZoneName: "short"
    }).format(date);
  }

  function formatReportDate(value) {
    const [year, month, day] = (value || "").split("-").map(Number);
    if (!year || !month || !day || !doualaDateBoundary(value)) return "Date non précisée";
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" })
      .format(new Date(Date.UTC(year, month - 1, day, 12)));
  }

  function getFilterDescription(filters) {
    return [
      `Atelier(s) : ${filters.workshop ? workshopNames[filters.workshop] || filters.workshop : "Tous"}`,
      `Statut : ${filters.status ? statusNames[filters.status] || filters.status : "Tous"}`,
      `Recherche : ${filters.query ? (searchFilter?.value || "").trim() : "Aucune"}`,
      `Période d’inscription : ${filters.dateFrom || filters.dateTo
        ? `${filters.dateFrom ? formatReportDate(filters.dateFrom) : "depuis toujours"} — ${filters.dateTo ? formatReportDate(filters.dateTo) : "jusqu’à aujourd’hui"}`
        : "Toutes les dates"}`
    ];
  }

  function selectedPdfColumns(selectedKeys, definitions) {
    const selected = new Set(selectedKeys);
    return definitions.filter((column) => selected.has(column.key));
  }

  function readSelectedPdfColumnKeys() {
    return Array.from(document.querySelectorAll('input[name="pdf-column"]:checked'), (input) => input.value);
  }

  async function getLogoDataUrl() {
    const image = new Image();
    image.src = "/assets/ict4d-logo.png";
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    });
    const maxDimension = 600;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Le logo ne peut pas être préparé.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  }

  function safePdfLines(doc, text, width, maxLines = 4) {
    const normalized = String(text || "—").replace(/[\r\n\t]+/g, " ");
    const lines = doc.splitTextToSize(normalized, width);
    if (lines.length <= maxLines) return lines;
    const result = lines.slice(0, maxLines);
    let finalLine = String(result[maxLines - 1]);
    while (finalLine.length && doc.getTextWidth(`${finalLine}…`) > width) finalLine = finalLine.slice(0, -1);
    result[maxLines - 1] = `${finalLine}…`;
    return result;
  }

  async function createPdf(rows, filters) {
    if (!window.jspdf?.jsPDF) throw new Error("La bibliothèque locale de création PDF est indisponible.");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
    const createdAt = new Date();
    const reportDate = reportDateInput?.value || doualaDateInputValue(createdAt);
    const reportTitle = (document.querySelector("#pdf-title")?.value || "").trim().slice(0, 120) || "Rapport des préinscriptions aux ateliers";
    const filenameStem = reportTitle.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "ict4d-preinscriptions";
    const margin = 12;
    const pageWidth = 297;
    const pageHeight = 210;
    const bottomLimit = 196;
    const columnDefinitions = [
      { key: "date", label: "Date", weight: 34, get: (row) => formatDate(row.created_at) },
      { key: "name", label: "Nom", weight: 43, get: (row) => row.full_name || "—" },
      { key: "email", label: "E-mail", weight: 62, get: (row) => row.email || "—" },
      { key: "level", label: "Niveau", weight: 24, get: (row) => row.level || "—" },
      { key: "workshop", label: "Ateliers", weight: 92, get: (row) => registrationWorkshopLabel(row) },
      { key: "status", label: "Statut", weight: 38, get: (row) => statusNames[row.status] || row.status || "—" }
    ];
    const chosenColumns = selectedPdfColumns(readSelectedPdfColumnKeys(), columnDefinitions);
    if (!chosenColumns.length) throw new Error("Sélectionnez au moins une colonne pour créer le PDF.");
    const availableWidth = pageWidth - margin * 2;
    const totalWeight = chosenColumns.reduce((total, column) => total + column.weight, 0);
    const columns = chosenColumns.map((column) => ({ ...column, width: availableWidth * column.weight / totalWeight }));
    const filtersText = getFilterDescription(filters);
    const filterLine = filtersText.join("   ·   ");
    let logoData;
    try { logoData = await getLogoDataUrl(); } catch { logoData = null; }

    function drawPageHeader(pageNumber) {
      if (logoData) doc.addImage(logoData, "PNG", margin, 8, 19, 19, undefined, "FAST");
      doc.setTextColor(16, 45, 82);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text("ICT4D · Université de Yaoundé I", 35, 15);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(79, 96, 116);
      doc.text(safePdfLines(doc, reportTitle, pageWidth - margin - 35, 1), 35, 21);
      doc.setFontSize(8);
      doc.text(`Rapport du ${formatReportDate(reportDate)} · Édité le ${doualaTimestamp(createdAt)} · Africa/Douala`, pageWidth - margin, 14, { align: "right" });
      doc.setDrawColor(211, 221, 232);
      doc.line(margin, 31, pageWidth - margin, 31);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(42, 59, 79);
      doc.text(`${rows.length} ligne${rows.length === 1 ? "" : "s"} · Filtres appliqués :`, margin, 38);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      const filterLines = doc.splitTextToSize(filterLine, pageWidth - margin * 2);
      doc.text(filterLines.slice(0, 2), margin, 43);

      const headerY = 53;
      doc.setFillColor(16, 45, 82);
      doc.rect(margin, headerY - 5, pageWidth - margin * 2, 9, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      let x = margin;
      for (const column of columns) {
        doc.text(column.label, x + 2, headerY + 1);
        x += column.width;
      }
      doc.setFont("helvetica", "normal");
      return headerY + 9;
    }

    function drawFooter() {
      const pages = doc.internal.getNumberOfPages();
      for (let page = 1; page <= pages; page += 1) {
        doc.setPage(page);
        doc.setDrawColor(220, 228, 237);
        doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(91, 105, 122);
        doc.text("CONFIDENTIEL · USAGE INTERNE UNIQUEMENT", margin, pageHeight - 7);
        doc.text(`Page ${page} / ${pages}`, pageWidth - margin, pageHeight - 7, { align: "right" });
      }
    }

    doc.setProperties({
      title: reportTitle,
      subject: "Rapport interne des préinscriptions filtrées",
      author: "Université de Yaoundé I — ICT4D",
      keywords: "ICT4D, préinscriptions, confidentiel"
    });

    let y = drawPageHeader(1);
    doc.setFontSize(7.8);
    doc.setTextColor(31, 45, 61);
    for (const registration of rows) {
      const cellLines = columns.map((column) => safePdfLines(doc, column.get(registration), column.width - 4));
      const lineCount = Math.max(...cellLines.map((lines) => lines.length));
      const rowHeight = Math.max(9, lineCount * 3.7 + 4);
      if (y + rowHeight > bottomLimit) {
        doc.addPage();
        y = drawPageHeader(doc.internal.getNumberOfPages());
      }
      if (doc.internal.getNumberOfPages() % 2 === 0) {
        doc.setFillColor(247, 249, 252);
        doc.rect(margin, y - 3, pageWidth - margin * 2, rowHeight, "F");
      }
      let x = margin;
      for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
        doc.text(cellLines[columnIndex], x + 2, y + 1);
        x += columns[columnIndex].width;
      }
      doc.setDrawColor(230, 235, 241);
      doc.line(margin, y + rowHeight - 3, pageWidth - margin, y + rowHeight - 3);
      y += rowHeight;
    }

    if (!rows.length) {
      doc.setFontSize(9);
      doc.setTextColor(91, 105, 122);
      doc.text("Aucune préinscription ne correspond aux filtres appliqués.", margin, y + 8);
    }
    drawFooter();
    doc.save(`${filenameStem}-${reportDate || filenameSafeDate(createdAt)}.pdf`);
  }

  const proposalStatusLabels = { received: "Reçu", under_review: "En étude", accepted: "Accepté", rejected: "Refusé" };
  const proposalTypeLabels = { new: "Nouvelle idée", improvement: "Amélioration" };
  const workshopStatusLabels = { draft: "Brouillon", published: "Publié", archived: "Archivé" };
  const resources = { proposals: null, workshops: null };
  let activeTab = "participants";
  let resourceBusy = false;
  let cropImage = null;
  let cropDataUrl = "";
  let cropTimer = 0;
  const proposalList = document.querySelector("#proposal-list");
  const workshopList = document.querySelector("#workshop-list");
  const editor = document.querySelector("#workshop-editor");
  const workshopForm = document.querySelector("#workshop-form");
  const proposalQuery = document.querySelector("#proposal-search");
  const workshopQuery = document.querySelector("#workshop-search");

  function updateTabCounts() {
    const values = { participants: registrations.length, proposals: resources.proposals?.length, workshops: resources.workshops?.length };
    for (const [key, value] of Object.entries(values)) {
      const node = document.querySelector(`#count-${key}`);
      if (node) node.textContent = value === undefined ? "—" : String(value);
    }
  }

  function normalizeQuery(value) { return String(value || "").trim().toLocaleLowerCase("fr"); }
  function recordMatches(record, query, fields) {
    if (!query) return true;
    return fields.map((key) => record[key]).filter((value) => value !== null && value !== undefined).join(" ").toLocaleLowerCase("fr").includes(query);
  }
  function makeElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function makeStatusSelect(labels, selected, ariaLabel) {
    const select = document.createElement("select");
    select.setAttribute("aria-label", ariaLabel);
    for (const [value, label] of Object.entries(labels)) {
      const option = document.createElement("option"); option.value = value; option.textContent = label; select.append(option);
    }
    select.value = labels[selected] ? selected : Object.keys(labels)[0];
    return select;
  }
  function setResourceState(type, text, error = false) {
    const node = document.querySelector(`#${type === "proposals" ? "proposal" : "workshop"}-state`);
    if (node) { node.textContent = text; node.classList.toggle("state-error", error); }
  }
  function updateActiveDescription() {
    if (!pageCount) return;
    if (activeTab === "participants") pageCount.textContent = `${registrations.length} participant${registrations.length === 1 ? "" : "s"} chargé${registrations.length === 1 ? "" : "s"}`;
    else {
      const items = resources[activeTab];
      pageCount.textContent = items === null ? "Liste non chargée" : `${items.length} ${activeTab === "proposals" ? "proposition" : "atelier"}${items.length === 1 ? "" : "s"} chargé${items.length === 1 ? "" : "s"}`;
    }
  }
  function authExpired(response) {
    if (response.status !== 401) return false;
    showLogin("Votre session a expiré. Reconnectez-vous.");
    return true;
  }
  async function fetchAllResource(resource) {
    const rows = [];
    let offset = 0;
    let batch = 0;
    const label = resource === "proposals" ? "propositions" : "ateliers";
    while (true) {
      batch += 1;
      showProgress(`Chargement des ${label} · lot ${batch}`, rows.length, batch);
      const { response, data } = await api(`?resource=${encodeURIComponent(resource)}&limit=${PAGE_SIZE}&offset=${offset}`);
      if (authExpired(response)) return null;
      if (!response.ok || !data || typeof data !== "object") throw new Error(`Impossible de charger ${label}.`);
      const batchRows = resource === "proposals" ? data.proposals : data.workshops;
      if (!response.ok || !Array.isArray(batchRows)) throw new Error(`Impossible de charger ${label}.`);
      rows.push(...batchRows);
      showProgress(`Chargement des ${label} · lot ${batch}`, rows.length, batch);
      if (batchRows.length < PAGE_SIZE) break;
      offset += batchRows.length;
      await pause(PAGE_DELAY_MS);
    }
    if (loadingProgress) loadingProgress.value = 100;
    return rows;
  }
  async function loadResource(resource, force = false) {
    if (resourceBusy || (resources[resource] !== null && !force)) return;
    resourceBusy = true;
    if (pageCount && activeTab === resource) pageCount.textContent = `Chargement des ${resource === "proposals" ? "propositions" : "ateliers"}…`;
    setResourceState(resource, `Chargement des ${resource === "proposals" ? "propositions" : "ateliers"}…`);
    showProgress(`Chargement des ${resource === "proposals" ? "propositions" : "ateliers"}`, 0, 0);
    try {
      const rows = await fetchAllResource(resource);
      if (rows === null) return;
      resources[resource] = rows;
      if (resource === "workshops") {
        for (const workshop of rows) {
          const code = typeof workshop.registration_code === "string" ? workshop.registration_code : "";
          const title = typeof workshop.title === "string" ? workshop.title : "";
          if (!code || !title) continue;
          workshopNames[code] = title;
          if (workshopFilter) {
            const existingOption = Array.from(workshopFilter.options).find((option) => option.value === code);
            if (existingOption) existingOption.textContent = title;
            else { const option = document.createElement("option"); option.value = code; option.textContent = title; workshopFilter.append(option); }
          }
        }
        renderTable();
      }
      if (resource === "proposals") renderProposals(); else renderWorkshops();
      setResourceState(resource, rows.length ? `${rows.length} élément${rows.length === 1 ? "" : "s"} chargé${rows.length === 1 ? "" : "s"}.` : `Aucun${resource === "proposals" ? "e proposition" : " atelier"} pour le moment.`);
      updateTabCounts(); updateActiveDescription();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Le chargement a échoué.";
      setResourceState(resource, `${message} Vous pouvez réessayer avec Actualiser.`, true);
      if (pageCount) pageCount.textContent = "La liste n’a pas pu être chargée.";
    } finally {
      hideProgress(); resourceBusy = false;
      if (activeTab !== resource && resources[activeTab] === null) loadResource(activeTab);
    }
  }
  function selectTab(name) {
    activeTab = name;
    for (const button of document.querySelectorAll(".admin-tab")) {
      const chosen = button.dataset.tab === name;
      button.classList.toggle("is-active", chosen);
      button.setAttribute("aria-selected", chosen ? "true" : "false");
      button.tabIndex = chosen ? 0 : -1;
    }
    for (const panel of document.querySelectorAll(".tab-panel")) panel.hidden = panel.id !== `panel-${name}`;
    if (name === "participants") updateActiveDescription();
    else if (resources[name] === null) loadResource(name);
    else updateActiveDescription();
  }
  async function updateProposalStatus(proposal, status, select) {
    const prior = proposal.status;
    select.disabled = true;
    try {
      const { response, data } = await api("", { method: "PATCH", body: JSON.stringify({ action: "update-proposal-status", proposal_id: proposal.id, status }) });
      if (authExpired(response)) return;
      if (!response.ok || !data.ok) throw new Error(data.message || "Le statut n’a pas pu être modifié.");
      proposal.status = status; setMessage(dashboardMessage, "Statut de proposition mis à jour.", true);
      renderProposals(); updateTabCounts();
    } catch (error) {
      proposal.status = prior; select.value = prior;
      setMessage(dashboardMessage, error instanceof Error ? error.message : "Connexion indisponible.");
    } finally { if (select.isConnected) select.disabled = false; }
  }
  function renderProposals() {
    if (!proposalList || resources.proposals === null) return;
    proposalList.replaceChildren();
    const query = normalizeQuery(proposalQuery?.value);
    const found = resources.proposals.filter((item) => recordMatches(item, query, ["title", "theme", "summary", "proposer_name", "contact_email", "proposal_type", "target_workshop_slug", "status"]));
    if (!found.length) { proposalList.append(makeElement("p", "resource-empty", resources.proposals.length ? "Aucune proposition ne correspond à la recherche." : "Aucune proposition à examiner.")); return; }
    for (const item of found) {
      const card = makeElement("article", "record-card");
      const heading = makeElement("div", "record-heading");
      const title = makeElement("h3", "", item.title || "Proposition sans titre");
      const badge = makeElement("span", `status-badge status-${item.status || "received"}`, proposalStatusLabels[item.status] || item.status || "Reçu");
      heading.append(title, badge); card.append(heading);
      if (item.theme) card.append(makeElement("p", "record-theme", item.theme));
      if (item.summary) card.append(makeElement("p", "record-summary", item.summary));
      const meta = makeElement("div", "record-meta");
      meta.append(makeElement("span", "", `${item.duration_minutes || "—"} min`), makeElement("span", "", `Proposé par ${item.proposer_name || "—"}`), makeElement("span", "", item.contact_email || "—"), makeElement("span", "", formatDate(item.created_at)));
      if (item.proposal_type) meta.append(makeElement("span", "", `Type : ${proposalTypeLabels[item.proposal_type] || item.proposal_type}`));
      if (item.target_workshop_slug) meta.append(makeElement("span", "", `Atelier concerné : ${workshopNames[item.target_workshop_slug] || item.target_workshop_slug}`));
      card.append(meta);
      const controls = makeElement("div", "record-controls");
      const select = makeStatusSelect(proposalStatusLabels, item.status, `Statut de ${item.title || "la proposition"}`);
      select.addEventListener("change", () => updateProposalStatus(item, select.value, select));
      const draftButton = makeElement("button", "button button-primary", "Préparer un brouillon d’atelier");
      draftButton.type = "button";
      draftButton.addEventListener("click", () => createWorkshopFromProposal(item));
      controls.append(select, draftButton); card.append(controls); proposalList.append(card);
    }
  }
  function slugify(value) {
    return String(value || "atelier").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "atelier";
  }
  async function createWorkshopFromProposal(proposal) {
    const suggested = slugify(proposal.title || "atelier");
    const slug = window.prompt("Slug unique du brouillon (minuscules et tirets) :", suggested);
    if (slug === null) return;
    const normalized = slug.trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) { setMessage(dashboardMessage, "Le slug doit contenir des minuscules, chiffres et tirets uniquement."); return; }
    try {
      const { response, data } = await api("", { method: "PATCH", body: JSON.stringify({ action: "create-workshop-from-proposal", proposal_id: proposal.id, slug: normalized }) });
      if (authExpired(response)) return;
      if (!response.ok || !data.ok) throw new Error(data.message || "Le brouillon n’a pas pu être créé.");
      resources.workshops = [];
      proposal.status = "accepted";
      renderProposals(); updateTabCounts();
      selectTab("workshops");
      await loadResource("workshops", true);
      const created = data.workshop || data.item || resources.workshops?.find((item) => String(item.source_proposal_id) === String(proposal.id) || item.slug === normalized);
      if (created) openWorkshopEditor(created);
      setMessage(dashboardMessage, "Brouillon préparé. Il n’est pas publié.", true);
    } catch (error) { setMessage(dashboardMessage, error instanceof Error ? error.message : "Connexion indisponible."); }
  }
  function renderWorkshops() {
    if (!workshopList || resources.workshops === null) return;
    workshopList.replaceChildren();
    const query = normalizeQuery(workshopQuery?.value);
    const found = resources.workshops.filter((item) => recordMatches(item, query, ["slug", "registration_code", "title", "theme", "summary", "description", "status", "facilitator_name", "facilitator_role"]));
    if (!found.length) { workshopList.append(makeElement("p", "resource-empty", resources.workshops.length ? "Aucun atelier ne correspond à la recherche." : "Aucun atelier enregistré.")); return; }
    for (const item of found) {
      const card = makeElement("article", "record-card");
      const heading = makeElement("div", "record-heading");
      heading.append(makeElement("h3", "", item.title || item.slug || "Atelier sans titre"), makeElement("span", `status-badge status-${item.status || "draft"}`, workshopStatusLabels[item.status] || item.status || "Brouillon"));
      card.append(heading);
      if (item.theme) card.append(makeElement("p", "record-theme", item.theme));
      if (item.summary) card.append(makeElement("p", "record-summary", item.summary));
      const meta = makeElement("div", "record-meta");
      meta.append(makeElement("span", "", `/${item.slug || ""}`), makeElement("span", "", `${item.duration_minutes || "—"} min`), makeElement("span", "", `Mis à jour : ${formatDate(item.updated_at || item.created_at)}`));
      meta.append(makeElement("span", "", `Planning : ${formatWorkshopSchedule(item) || "à confirmer"}`));
      if (item.facilitator_consent && item.facilitator_name) meta.append(makeElement("span", "", `Chargé·e : ${item.facilitator_name}`));
      card.append(meta);
      const controls = makeElement("div", "record-controls");
      const edit = makeElement("button", "button button-secondary", "Modifier"); edit.type = "button"; edit.addEventListener("click", () => openWorkshopEditor(item));
      controls.append(edit); card.append(controls); workshopList.append(card);
    }
  }
  function openWorkshopEditor(item = null) {
    if (!workshopForm || !editor) return;
    workshopForm.reset(); cropImage = null; cropDataUrl = "";
    document.querySelector("#workshop-id").value = item?.id || "";
    document.querySelector("#workshop-source-proposal").value = item?.source_proposal_id || "";
    document.querySelector("#workshop-editor-title").textContent = item ? `Modifier : ${item.title || item.slug}` : "Nouvel atelier";
    const fields = { "workshop-slug": "slug", "workshop-registration-code": "registration_code", "workshop-title-input": "title", "workshop-theme": "theme", "workshop-summary": "summary", "workshop-description": "description", "workshop-duration": "duration_minutes", "workshop-status": "status", "workshop-schedule-date": "schedule_date", "workshop-start-time": "start_time", "workshop-end-time": "end_time", "workshop-room": "room", "facilitator-name": "facilitator_name", "facilitator-role": "facilitator_role", "facilitator-bio": "facilitator_bio" };
    for (const [id, key] of Object.entries(fields)) {
      const value = item?.[key] ?? (key === "status" ? "draft" : "");
      document.getElementById(id).value = key === "start_time" || key === "end_time" ? String(value).slice(0, 5) : value;
    }
    document.querySelector("#facilitator-consent").checked = item?.facilitator_consent === true;
    const photo = document.querySelector("#photo-preview");
    const photoTools = document.querySelector("#photo-tools");
    if (item?.facilitator_photo_data) { photo.src = item.facilitator_photo_data; photoTools.hidden = false; }
    else { photo.removeAttribute("src"); photoTools.hidden = true; }
    const fileInput = document.querySelector("#facilitator-photo"); if (fileInput) fileInput.value = "";
    const archiveButton = document.querySelector("#archive-workshop-button"); archiveButton.hidden = !item || item.status === "archived";
    document.querySelector("#workshop-form-message").textContent = "";
    editor.hidden = false; editor.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function drawCrop() {
    if (!cropImage) return;
    const width = 600, height = 750, zoom = Number(document.querySelector("#photo-zoom").value || 1);
    const targetRatio = width / height;
    let cropW = cropImage.naturalWidth, cropH = cropW / targetRatio;
    if (cropH > cropImage.naturalHeight) { cropH = cropImage.naturalHeight; cropW = cropH * targetRatio; }
    cropW /= zoom; cropH /= zoom;
    const px = Number(document.querySelector("#photo-x").value || 50) / 100;
    const py = Number(document.querySelector("#photo-y").value || 50) / 100;
    const sx = (cropImage.naturalWidth - cropW) * px, sy = (cropImage.naturalHeight - cropH) * py;
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) { setMessage(document.querySelector("#workshop-form-message"), "Impossible de préparer l’image."); return; }
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, width, height);
    ctx.drawImage(cropImage, sx, sy, cropW, cropH, 0, 0, width, height);
    let quality = 0.88; let url = canvas.toDataURL("image/jpeg", quality);
    while (url.length > 650000 && quality > 0.42) { quality -= 0.08; url = canvas.toDataURL("image/jpeg", quality); }
    if (url.length > 650000) {
      canvas.width = 480; canvas.height = 600;
      const smaller = canvas.getContext("2d");
      if (smaller) { smaller.fillStyle = "#ffffff"; smaller.fillRect(0, 0, canvas.width, canvas.height); smaller.drawImage(cropImage, sx, sy, cropW, cropH, 0, 0, canvas.width, canvas.height); }
      url = canvas.toDataURL("image/jpeg", 0.55);
    }
    cropDataUrl = url;
    document.querySelector("#photo-preview").src = url;
    setMessage(document.querySelector("#workshop-form-message"), url.length > 650000 ? "Photo trop volumineuse après compression; choisissez une autre image." : `Aperçu JPEG local · ${url.length.toLocaleString("fr-FR")} caractères${url.length > 650000 ? " (limite dépassée)" : ""}`, url.length <= 650000);
  }
  function scheduleCrop() { window.clearTimeout(cropTimer); cropTimer = window.setTimeout(drawCrop, 80); }
  async function saveWorkshop(statusOverride = null) {
    if (!workshopForm.reportValidity()) return false;
    const consent = document.querySelector("#facilitator-consent").checked;
    const status = statusOverride || document.querySelector("#workshop-status").value;
    const isPublishing = status === "published";
    if (isPublishing && !consent && !window.confirm("Sans consentement explicite, aucun nom, rôle, biographie ou portrait ne sera envoyé pour affichage public. Publier uniquement la fiche d’atelier sans ces informations ?")) return false;
    if (cropDataUrl && cropDataUrl.length > 650000) { setMessage(document.querySelector("#workshop-form-message"), "La photo dépasse la limite de 650000 caractères."); return false; }
    const scheduleDate = document.querySelector("#workshop-schedule-date").value;
    const startTime = document.querySelector("#workshop-start-time").value;
    const endTime = document.querySelector("#workshop-end-time").value;
    const scheduleIsEmpty = !scheduleDate && !startTime && !endTime;
    if (!scheduleIsEmpty && (!scheduleDate || !startTime || !endTime || startTime >= endTime)) {
      setMessage(document.querySelector("#workshop-form-message"), "Pour publier un horaire, renseignez la date, l’heure de début et une heure de fin ultérieure.");
      return false;
    }
    const existing = resources.workshops?.find((item) => String(item.id) === document.querySelector("#workshop-id").value);
    const payload = {
      action: "upsert-workshop", id: document.querySelector("#workshop-id").value || undefined,
      slug: document.querySelector("#workshop-slug").value.trim(), registration_code: document.querySelector("#workshop-registration-code").value.trim() || null,
      title: document.querySelector("#workshop-title-input").value.trim(), theme: document.querySelector("#workshop-theme").value.trim(), summary: document.querySelector("#workshop-summary").value.trim(), description: document.querySelector("#workshop-description").value.trim(),
      duration_minutes: document.querySelector("#workshop-duration").value ? Number(document.querySelector("#workshop-duration").value) : null,
      schedule_date: scheduleDate || null, start_time: startTime || null, end_time: endTime || null,
      room: document.querySelector("#workshop-room").value.trim() || null,
      status, facilitator_name: consent ? document.querySelector("#facilitator-name").value.trim() : "", facilitator_role: consent ? document.querySelector("#facilitator-role").value.trim() : "", facilitator_bio: consent ? document.querySelector("#facilitator-bio").value.trim() : "",
      facilitator_photo_data: consent ? (cropDataUrl || existing?.facilitator_photo_data || "") : "", facilitator_consent: consent,
      sort_order: existing?.sort_order ?? 0, source_proposal_id: document.querySelector("#workshop-source-proposal").value || existing?.source_proposal_id || null,
      created_at: existing?.created_at || null, updated_at: existing?.updated_at || null
    };
    const button = document.querySelector("#save-workshop-button"); button.disabled = true;
    try {
      const { response, data } = await api("", { method: "PATCH", body: JSON.stringify(payload) });
      if (authExpired(response)) return false;
      if (!response.ok || !data.ok) throw new Error(data.message || "L’atelier n’a pas pu être enregistré.");
      resources.workshops = null; await loadResource("workshops", true);
      const saved = data.workshop || data.item || resources.workshops?.find((item) => item.slug === payload.slug);
      if (saved) openWorkshopEditor(saved); else editor.hidden = true;
      setMessage(dashboardMessage, status === "published" ? "Atelier publié." : status === "archived" ? "Atelier archivé." : "Brouillon enregistré.", true);
      return true;
    } catch (error) {
      setMessage(document.querySelector("#workshop-form-message"), error instanceof Error ? error.message : "Connexion indisponible."); return false;
    } finally { button.disabled = false; }
  }
  async function refreshActiveTab() {
    if (activeTab === "participants") return loadRegistrations();
    resources[activeTab] = null;
    return loadResource(activeTab, true);
  }

  for (const tab of document.querySelectorAll(".admin-tab")) tab.addEventListener("click", () => selectTab(tab.dataset.tab));
  for (const type of ["proposals", "workshops"]) {
    const input = type === "proposals" ? proposalQuery : workshopQuery;
    input?.addEventListener("input", () => { if (type === "proposals") renderProposals(); else renderWorkshops(); });
  }
  document.querySelector("#refresh-button")?.addEventListener("click", refreshActiveTab);
  document.querySelector("#new-workshop-button")?.addEventListener("click", () => openWorkshopEditor());
  document.querySelector("#cancel-workshop-button")?.addEventListener("click", () => { editor.hidden = true; });
  workshopForm?.addEventListener("submit", (event) => { event.preventDefault(); saveWorkshop(); });
  document.querySelector("#archive-workshop-button")?.addEventListener("click", () => {
    if (window.confirm("Archiver cet atelier ? Il ne sera plus publié.")) { document.querySelector("#workshop-status").value = "archived"; saveWorkshop("archived"); }
  });
  document.querySelector("#facilitator-photo")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setMessage(document.querySelector("#workshop-form-message"), "Choisissez une photo JPEG, PNG ou WebP."); event.target.value = ""; return; }
    const objectUrl = URL.createObjectURL(file); const image = new Image();
    image.onload = () => { URL.revokeObjectURL(objectUrl); cropImage = image; cropDataUrl = ""; document.querySelector("#photo-tools").hidden = false; document.querySelector("#photo-zoom").value = "1"; document.querySelector("#photo-x").value = "50"; document.querySelector("#photo-y").value = "50"; drawCrop(); };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); setMessage(document.querySelector("#workshop-form-message"), "L’image n’a pas pu être lue."); };
    image.src = objectUrl;
  });
  for (const id of ["photo-zoom", "photo-x", "photo-y"]) document.querySelector(`#${id}`)?.addEventListener("input", scheduleCrop);
  document.querySelector("#facilitator-consent")?.addEventListener("change", (event) => {
    if (!event.target.checked) setMessage(document.querySelector("#workshop-form-message"), "Sans accord explicite, les champs d’identité et le portrait seront omis à l’enregistrement.");
  });

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!loginForm.reportValidity()) return;
    const username = String(new FormData(loginForm).get("username") || "").trim();
    const passwordInput = document.querySelector("#password");
    const password = passwordInput?.value || "";
    const button = document.querySelector("#login-button");
    if (button) button.disabled = true;
    setMessage(loginMessage, "Connexion…");
    try {
      const { response, data } = await api("", {
        method: "POST",
        body: JSON.stringify({ action: "login", username, password })
      });
      if (!response.ok || !data.ok) {
        setMessage(loginMessage, data.message || "Identifiant ou mot de passe incorrect.");
        return;
      }
      if (passwordInput) passwordInput.value = "";
      showDashboard();
      currentPage = 0;
      selectTab("participants");
      await loadResource("workshops");
      await loadRegistrations();
    } catch {
      setMessage(loginMessage, "Connexion indisponible. Réessayez.");
    } finally {
      if (button) button.disabled = false;
    }
  });

  document.querySelector("#previous-button")?.addEventListener("click", () => {
    currentPage = Math.max(0, currentPage - 1);
    renderTable();
  });
  document.querySelector("#next-button")?.addEventListener("click", () => {
    const totalPages = Math.ceil(getFilteredRows().length / UI_PAGE_SIZE);
    if (currentPage + 1 < totalPages) {
      currentPage += 1;
      renderTable();
    }
  });
  workshopFilter?.addEventListener("change", () => { currentPage = 0; renderTable(); });
  statusFilter?.addEventListener("change", () => { currentPage = 0; renderTable(); });
  registrationDateFrom?.addEventListener("change", () => { currentPage = 0; renderTable(); });
  registrationDateTo?.addEventListener("change", () => { currentPage = 0; renderTable(); });
  searchFilter?.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => { currentPage = 0; renderTable(); }, 120);
  });

  if (reportDateInput && !reportDateInput.value) reportDateInput.value = doualaDateInputValue();
  document.querySelectorAll('input[name="pdf-column"]').forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (!readSelectedPdfColumnKeys().length) {
        checkbox.checked = true;
        setMessage(dashboardMessage, "Le PDF doit contenir au moins une colonne.");
      }
    });
  });

  exportButton?.addEventListener("click", async () => {
    if (dashboardBusy) return;
    const filters = readFilters();
    setBusy(true);
    setMessage(dashboardMessage, "");
    try {
      const allRows = await fetchAllRegistrations("Préparation du PDF");
      if (allRows === null) return;
      registrations = allRows;
      updateStats();
      renderTable();
      const filteredRows = allRows.filter((row) => registrationMatches(row, filters));
      await createPdf(filteredRows, filters);
      setMessage(dashboardMessage, `PDF créé dans votre navigateur : ${filteredRows.length} ligne${filteredRows.length === 1 ? "" : "s"}.`, true);
    } catch (error) {
      setMessage(dashboardMessage, error instanceof Error ? error.message : "Le PDF n’a pas pu être créé.");
    } finally {
      hideProgress();
      setBusy(false);
    }
  });

  document.querySelector("#logout-button")?.addEventListener("click", async () => {
    try {
      await api("", { method: "DELETE" });
    } catch {
      // Le panneau de connexion est affiché même si la requête de fermeture échoue.
    } finally {
      registrations = [];
      resources.proposals = null; resources.workshops = null;
      showLogin("Vous êtes déconnecté.");
    }
  });

  document.querySelector("#password-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const newPassword = document.querySelector("#new-password")?.value || "";
    const confirmPassword = document.querySelector("#confirm-password")?.value || "";
    if (newPassword.length < 12) {
      setMessage(dashboardMessage, "Le mot de passe doit contenir au moins 12 caractères.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage(dashboardMessage, "Les deux mots de passe ne correspondent pas.");
      return;
    }
    const button = document.querySelector("#change-password-button");
    if (button) button.disabled = true;
    try {
      const { response, data } = await api("", {
        method: "PATCH",
        body: JSON.stringify({ action: "change-password", new_password: newPassword })
      });
      if (response.status === 401) {
        showLogin("Votre session a expiré. Reconnectez-vous.");
        return;
      }
      if (!response.ok || !data.ok) {
        setMessage(dashboardMessage, data.message || "Le mot de passe n’a pas été modifié.");
        return;
      }
      form.reset();
      setMessage(dashboardMessage, "Mot de passe mis à jour. Les autres sessions ont été déconnectées.", true);
    } catch {
      setMessage(dashboardMessage, "Connexion indisponible. Réessayez.");
    } finally {
      if (button) button.disabled = false;
    }
  });

  (async () => {
    try {
      const { response } = await api();
      if (response.status === 401) {
        showLogin();
        return;
      }
      if (response.ok) {
        showDashboard();
        selectTab("participants");
        await loadRegistrations();
      } else {
        showLogin();
      }
    } catch {
      showLogin("Connexion indisponible. Réessayez.");
    }
  })();
})();
