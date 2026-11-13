/**
 * App controller: starts on the home menu, runs the new game setup when
 * asked, keeps map + legend in sync with the saved game and drives the state
 * modal where players are marked as having spotted a plate.
 */
import { api } from "./api.js";
import * as home from "./home.js";
import * as legend from "./legend.js";
import * as map from "./map.js";
import * as setup from "./setup.js";
import { STATE_BY_CODE } from "./states.js";

const backdrop = document.getElementById("modal-backdrop");
const closeBtn = document.getElementById("modal-close");
const plateState = document.getElementById("modal-plate-state");
const stateNameEl = document.getElementById("modal-state-name");
const optionsBox = document.getElementById("modal-options");
const datesBox = document.getElementById("modal-dates");
const datesList = document.getElementById("modal-dates-list");
const emptyMsg = document.getElementById("modal-empty");
const loadingMsg = document.getElementById("modal-loading");
const menuBtn = document.getElementById("open-menu");

let players = [];
// Latest {code, status, seen_by} of every state, feeding map and legend.
let states = [];
let currentCode = null;
let currentDetail = null;

const dateFormatter = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "medium",
  timeStyle: "short",
});

/* ---------- Map + legend ---------- */

function repaint() {
  const statusByCode = {};
  states.forEach((s) => {
    statusByCode[s.code] = s.status;
  });
  map.updateStatuses(statusByCode);
  legend.render(players, states);
}

function fetchStates() {
  return api.getStates().then((list) => {
    states = list;
    repaint();
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

// Shows the detail `request` resolves with if that state is still open, and
// repaints the map. A failed write re-reads the saved data, so the modal
// never shows a mark that wasn't stored.
function showDetail(code, request) {
  return request()
    .catch(() => api.getState(code))
    .then((detail) => {
      if (currentCode === code) renderDetail(detail);
      return fetchStates();
    });
}

function openModal(code, name) {
  currentCode = code;
  plateState.textContent = name;
  stateNameEl.textContent = name;
  optionsBox.replaceChildren();
  showLoading();
  backdrop.hidden = false;
  showDetail(code, () => api.getState(code));
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
  // Block further clicks until the change is saved.
  setChecksEnabled(false);
  showDetail(code, () => api.setSighting(code, playerId, seen));
}

optionsBox.addEventListener("change", (event) => {
  if (event.target.matches("input[type=checkbox]")) toggleSighting(event.target);
});

/* ---------- Home menu + new game ---------- */

// A new game replaces the one in progress for good, so that needs an
// explicit confirmation. Nothing is erased until the new players are saved.
function confirmNewGame() {
  return window.confirm(
    "¿Empezar un juego nuevo?\n\n" +
      "Se borrarán los jugadores y las patentes marcadas de la partida actual, y no se podrán recuperar."
  );
}

function newGame() {
  if (players.length && !confirmNewGame()) return showHome();
  return setup.open().then((list) => {
    if (!list) return showHome();
    players = list;
    return fetchStates();
  });
}

function showHome() {
  closeModal();
  return home.open({ hasGame: players.length > 0 }).then((choice) => {
    if (choice === "new") return newGame();
  });
}

/* ---------- Lifecycle ---------- */

closeBtn.addEventListener("click", closeModal);
backdrop.addEventListener("click", (event) => {
  if (event.target === backdrop) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !backdrop.hidden) closeModal();
});
menuBtn.addEventListener("click", showHome);

map.init({
  onStateClick: (code) => openModal(code, STATE_BY_CODE.get(code).name),
});
api
  .getPlayers()
  .then((list) => {
    players = list;
    return fetchStates();
  })
  .then(showHome);
