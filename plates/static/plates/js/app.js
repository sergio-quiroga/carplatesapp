/**
 * App controller: loads players (running the initial setup when there are
 * none), keeps map + legend in sync with the server and drives the state
 * modal where players are marked as having spotted a plate.
 */
(function () {
  "use strict";

  const api = window.USAPLATESApi;
  const map = window.USAPLATESMap;
  const legend = window.USAPLATESLegend;
  const setup = window.USAPLATESSetup;

  const RETRY_DELAY_MS = 2000;

  const backdrop = document.getElementById("modal-backdrop");
  const closeBtn = document.getElementById("modal-close");
  const plateState = document.getElementById("modal-plate-state");
  const stateNameEl = document.getElementById("modal-state-name");
  const optionsBox = document.getElementById("modal-options");
  const datesBox = document.getElementById("modal-dates");
  const datesList = document.getElementById("modal-dates-list");
  const emptyMsg = document.getElementById("modal-empty");
  const loadingMsg = document.getElementById("modal-loading");

  let players = [];
  let setupPromise = null;
  // Latest known {status, seen_by} per state code, feeding map and legend.
  const summaryByCode = {};
  const nameByCode = {};
  let currentCode = null;
  let currentDetail = null;
  // Every request gets an increasing number. latestSeqByCode is the newest
  // detail/write request per state (only its response may fill the modal);
  // appliedSeqByCode is the newest response already painted on the map, so an
  // older response (detail or full list) never overwrites newer data.
  let requestSeq = 0;
  const latestSeqByCode = {};
  const appliedSeqByCode = {};
  // Unconfirmed mark/unmark per state, so list refreshes and reopening the
  // modal don't show data read before the write was committed.
  const pendingWrites = new Map();

  const dateFormatter = new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  /* ---------- Map + legend ---------- */

  function applySummary(code, summary, seq) {
    if ((appliedSeqByCode[code] || 0) > seq) return;
    appliedSeqByCode[code] = seq;
    summaryByCode[code] = summary;
  }

  function repaint() {
    const statusByCode = {};
    Object.keys(summaryByCode).forEach((code) => {
      statusByCode[code] = summaryByCode[code].status;
    });
    map.updateStatuses(statusByCode);
    legend.render(players, Object.values(summaryByCode));
  }

  function fetchStates() {
    const seq = ++requestSeq;
    return api.getStates().then((states) => {
      states.forEach((s) => {
        nameByCode[s.code] = s.name;
        if (!pendingWrites.has(s.code)) {
          applySummary(s.code, { status: s.status, seen_by: s.seen_by }, seq);
        }
      });
      repaint();
    });
  }

  /* ---------- Players ---------- */

  // Resolves with the players, running the setup modal if there are none yet.
  function ensurePlayers() {
    if (setupPromise) return setupPromise;
    return api.getPlayers().then((list) => {
      if (list.length) return list;
      setupPromise = setup.open().finally(() => {
        setupPromise = null;
      });
      return setupPromise;
    });
  }

  function loadPlayers() {
    return ensurePlayers().then((list) => {
      players = list;
    });
  }

  /* ---------- State modal ---------- */

  function renderOptions(detail) {
    const options = detail.players.map((p) => {
      const label = document.createElement("label");
      label.className = "option";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = p.seen;
      checkbox.dataset.playerId = p.id;

      const name = document.createElement("span");
      name.className = "option-name";
      name.textContent = p.name;

      label.append(checkbox, legend.avatar(p), name);
      return label;
    });
    optionsBox.replaceChildren(...options);
  }

  function setChecksEnabled(enabled) {
    optionsBox.querySelectorAll("input").forEach((input) => {
      input.disabled = !enabled;
    });
  }

  function showLoading() {
    currentDetail = null;
    setChecksEnabled(false);
    datesBox.hidden = true;
    emptyMsg.hidden = true;
    loadingMsg.hidden = false;
  }

  // One line per player who has marked the plate, oldest mark first.
  function renderDates(detail) {
    const lines = detail.players
      .filter((p) => p.seen)
      .sort((a, b) => new Date(a.first_seen) - new Date(b.first_seen))
      .map((p) => {
        const li = document.createElement("li");
        li.className = "modal-date";

        const name = document.createElement("span");
        name.className = "modal-date-name";
        name.textContent = p.name;

        const date = document.createElement("time");
        date.className = "modal-date-when";
        date.dateTime = p.first_seen;
        date.textContent = dateFormatter.format(new Date(p.first_seen));

        li.append(legend.avatar(p), name, date);
        return li;
      });
    datesList.replaceChildren(...lines);
    datesBox.hidden = lines.length === 0;
    emptyMsg.hidden = lines.length > 0;
  }

  function renderDetail(detail) {
    currentDetail = detail;
    renderOptions(detail);
    loadingMsg.hidden = true;
    renderDates(detail);
  }

  function summaryFromDetail(detail) {
    return {
      status: detail.status,
      seen_by: detail.players.filter((p) => p.seen).map((p) => p.id),
    };
  }

  // Runs a request for a state and applies its response only if it is still
  // the latest one for that state (map) and that state is still open (modal).
  function requestDetail(code, doRequest) {
    const seq = ++requestSeq;
    latestSeqByCode[code] = seq;

    return doRequest()
      .then((detail) => {
        applySummary(code, summaryFromDetail(detail), seq);
        repaint();
        if (latestSeqByCode[code] === seq && currentCode === code) renderDetail(detail);
      })
      .catch(() => {
        // Resync with the server so the modal never shows unconfirmed data.
        setTimeout(() => {
          if (latestSeqByCode[code] !== seq || currentCode !== code) return;
          requestDetail(code, () => api.getState(code));
        }, RETRY_DELAY_MS);
      });
  }

  function openModal(code, name) {
    currentCode = code;
    plateState.textContent = name;
    stateNameEl.textContent = name;
    optionsBox.replaceChildren();
    showLoading();
    backdrop.hidden = false;

    // If a mark/unmark for this state is still in flight, read after it lands.
    (pendingWrites.get(code) || Promise.resolve()).then(() => {
      if (currentCode === code) requestDetail(code, () => api.getState(code));
    });
  }

  function closeModal() {
    backdrop.hidden = true;
    currentCode = null;
  }

  // Unmarking deletes the sighting and its first-seen date for good, so it
  // needs an explicit confirmation.
  function confirmUnmark(player) {
    const since = player.first_seen
      ? " (" + dateFormatter.format(new Date(player.first_seen)) + ")"
      : "";
    return window.confirm(
      `¿Desmarcar que ${player.name} vio la patente de ${stateNameEl.textContent}?\n\n` +
        `Se borrará la fecha en que la vio por primera vez${since} y no se podrá recuperar.`
    );
  }

  function toggleSighting(checkbox) {
    const code = currentCode;
    if (!code || !currentDetail) return;
    const playerId = Number(checkbox.dataset.playerId);
    const player = currentDetail.players.find((p) => p.id === playerId);
    if (!player) return;

    const seen = checkbox.checked;
    if (!seen && !confirmUnmark(player)) {
      checkbox.checked = true;
      return;
    }
    // Block further clicks until the server confirms, so requests for the
    // same state can't be processed out of order.
    setChecksEnabled(false);
    const write = requestDetail(code, () => api.setSighting(code, playerId, seen));
    pendingWrites.set(code, write);
    write.then(() => {
      if (pendingWrites.get(code) === write) pendingWrites.delete(code);
    });
  }

  optionsBox.addEventListener("change", (event) => {
    if (event.target.matches("input[type=checkbox]")) toggleSighting(event.target);
  });

  /* ---------- Lifecycle ---------- */

  // Pick up changes made from other phones when coming back to the app.
  function refresh() {
    if (setupPromise) return;
    loadPlayers()
      .then(fetchStates)
      .catch(() => {});
    if (currentCode && currentDetail && !pendingWrites.has(currentCode)) {
      const code = currentCode;
      requestDetail(code, () => api.getState(code));
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) refresh();
  });

  closeBtn.addEventListener("click", closeModal);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !backdrop.hidden) closeModal();
  });

  Promise.all([
    map.init({
      onStateClick: (code) => openModal(code, nameByCode[code] || code),
    }),
    loadPlayers(),
  ])
    .then(fetchStates)
    .then(repaint);
})();
