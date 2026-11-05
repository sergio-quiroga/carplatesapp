/**
 * Initial game setup modal: asks how many players there are, then their
 * names and face avatars, and creates them on the server. It cannot be
 * dismissed, since the game is unusable without players.
 */
(function () {
  "use strict";

  const config = window.USAPLATES;
  const api = window.USAPLATESApi;
  const AVATARS = JSON.parse(document.getElementById("avatars-data").textContent);

  const MIN_PLAYERS = 1;
  const DEFAULT_PLAYERS = 2;
  // Step through the catalog when suggesting faces, so neighbors look different.
  const AVATAR_SUGGESTION_STEP = 7;

  const backdrop = document.getElementById("setup-backdrop");
  const countStep = document.getElementById("setup-step-count");
  const namesStep = document.getElementById("setup-step-names");
  const countEl = document.getElementById("setup-count");
  const decBtn = document.getElementById("setup-count-dec");
  const incBtn = document.getElementById("setup-count-inc");
  const namesBox = document.getElementById("setup-names");
  const picker = document.getElementById("avatar-picker");
  const errorEl = document.getElementById("setup-error");
  const backBtn = document.getElementById("setup-back");
  const submitBtn = document.getElementById("setup-submit");

  let count = DEFAULT_PLAYERS;
  // Names and faces chosen so far, kept across "Atrás" so going back doesn't lose them.
  let draftNames = [];
  const draftAvatars = [];
  // Index of the player row the face picker is open for, or null.
  let pickerRow = null;
  // Player row elements by index. Not namesBox.children: the open picker is
  // inserted among the rows and would shift those indexes.
  let rowEls = [];
  let resolveSetup = null;

  function suggestedAvatar(index) {
    return AVATARS[(index * AVATAR_SUGGESTION_STEP) % AVATARS.length];
  }

  function setCount(value) {
    count = Math.min(config.maxPlayers, Math.max(MIN_PLAYERS, value));
    countEl.textContent = count;
    decBtn.disabled = count <= MIN_PLAYERS;
    incBtn.disabled = count >= config.maxPlayers;
  }

  function readNames() {
    return Array.from(namesBox.querySelectorAll("input"), (input) => input.value.trim());
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = !message;
  }

  /* ---------- Face picker ---------- */

  function renderPicker() {
    const buttons = AVATARS.map((face) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "avatar-choice";
      btn.textContent = face;
      btn.dataset.avatar = face;
      btn.setAttribute("role", "option");
      return btn;
    });
    picker.replaceChildren(...buttons);
  }

  function closePicker() {
    if (pickerRow !== null) {
      rowEls[pickerRow].querySelector(".avatar-btn").setAttribute("aria-expanded", "false");
    }
    pickerRow = null;
    picker.hidden = true;
  }

  function openPicker(index) {
    closePicker();
    pickerRow = index;
    const row = rowEls[index];
    row.querySelector(".avatar-btn").setAttribute("aria-expanded", "true");
    picker.querySelectorAll(".avatar-choice").forEach((btn) => {
      btn.setAttribute("aria-selected", String(btn.dataset.avatar === draftAvatars[index]));
    });
    row.after(picker);
    picker.hidden = false;
  }

  function chooseAvatar(face) {
    const index = pickerRow;
    draftAvatars[index] = face;
    rowEls[index].querySelector(".avatar-btn").textContent = face;
    closePicker();
    rowEls[index].querySelector("input").focus();
  }

  /* ---------- Steps ---------- */

  function showCountStep() {
    draftNames = readNames();
    closePicker();
    namesStep.hidden = true;
    countStep.hidden = false;
  }

  function playerRow(i) {
    if (!draftAvatars[i]) draftAvatars[i] = suggestedAvatar(i);

    const row = document.createElement("div");
    row.className = "setup-name";

    const avatarBtn = document.createElement("button");
    avatarBtn.type = "button";
    avatarBtn.className = "avatar avatar-btn";
    avatarBtn.textContent = draftAvatars[i];
    avatarBtn.setAttribute("aria-label", "Cambiar la cara del jugador " + (i + 1));
    avatarBtn.setAttribute("aria-expanded", "false");
    avatarBtn.addEventListener("click", () => (pickerRow === i ? closePicker() : openPicker(i)));

    const input = document.createElement("input");
    input.type = "text";
    input.required = true;
    input.maxLength = config.playerNameMaxLength;
    input.autocomplete = "off";
    input.placeholder = "Jugador " + (i + 1);
    input.value = draftNames[i] || "";
    input.setAttribute("aria-label", "Nombre del jugador " + (i + 1));

    row.append(avatarBtn, input);
    return row;
  }

  function showNamesStep() {
    const rows = [];
    for (let i = 0; i < count; i++) rows.push(playerRow(i));
    // The picker stays among the rows once opened; park it before re-rendering.
    closePicker();
    namesStep.insertBefore(picker, errorEl);
    namesBox.replaceChildren(...rows);
    rowEls = rows;
    showError("");
    countStep.hidden = true;
    namesStep.hidden = false;
    namesBox.querySelector("input").focus();
  }

  // Mirrors the server rules so most mistakes are caught without a round trip.
  function validate(names) {
    if (names.some((n) => !n)) return "Escribe el nombre de cada jugador.";
    const seen = new Set();
    for (const name of names) {
      const key = name.toLocaleLowerCase("es");
      if (seen.has(key)) return `El nombre "${name}" está repetido.`;
      seen.add(key);
    }
    return "";
  }

  // DRF nests list errors by index ({"players": {"0": {"avatar": [...]}}}).
  function collectMessages(value) {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(collectMessages);
    if (value && typeof value === "object") return Object.values(value).flatMap(collectMessages);
    return [];
  }

  function serverErrorMessage(err) {
    const messages = collectMessages(err.body && err.body.players);
    if (messages.length) return messages.join(" ");
    return "No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.";
  }

  function finish(players) {
    backdrop.hidden = true;
    resolveSetup(players);
  }

  function submit() {
    const names = readNames();
    const problem = validate(names);
    if (problem) {
      showError(problem);
      return;
    }
    showError("");
    closePicker();
    submitBtn.disabled = true;
    const players = names.map((name, i) => ({ name, avatar: draftAvatars[i] }));
    api
      .setupPlayers(players)
      .then(finish)
      .catch((err) => {
        // Someone else finished the setup first (e.g. from another phone).
        if (err instanceof api.ApiError && err.status === 409) {
          return api.getPlayers().then(finish);
        }
        showError(serverErrorMessage(err));
      })
      .finally(() => {
        submitBtn.disabled = false;
      });
  }

  decBtn.addEventListener("click", () => setCount(count - 1));
  incBtn.addEventListener("click", () => setCount(count + 1));
  countStep.addEventListener("submit", (event) => {
    event.preventDefault();
    showNamesStep();
  });
  backBtn.addEventListener("click", showCountStep);
  namesStep.addEventListener("submit", (event) => {
    event.preventDefault();
    submit();
  });
  picker.addEventListener("click", (event) => {
    const choice = event.target.closest(".avatar-choice");
    if (choice) chooseAvatar(choice.dataset.avatar);
  });

  renderPicker();

  /** Shows the setup modal and resolves with the created players. */
  function open() {
    setCount(count);
    countStep.hidden = false;
    namesStep.hidden = true;
    backdrop.hidden = false;
    return new Promise((resolve) => {
      resolveSetup = resolve;
    });
  }

  window.USAPLATESSetup = { open };
})();
