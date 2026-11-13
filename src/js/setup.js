/**
 * New game setup modal: asks how many players there are, then their names
 * and face avatars, and starts the game. "Atrás" on the first step cancels
 * it, leaving any game in progress untouched.
 */
import { api } from "./api.js";
import { AVATARS } from "./avatars.js";
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_NAME_MAX_LENGTH,
  ValidationError,
  validatePlayers,
} from "./game.js";

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
const cancelBtn = document.getElementById("setup-cancel");
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
  count = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, value));
  countEl.textContent = count;
  decBtn.disabled = count <= MIN_PLAYERS;
  incBtn.disabled = count >= MAX_PLAYERS;
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
  input.maxLength = PLAYER_NAME_MAX_LENGTH;
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

function errorMessage(err) {
  if (err instanceof ValidationError) return err.message;
  return "No se pudo guardar. Inténtalo de nuevo.";
}

function finish(players) {
  closePicker();
  backdrop.hidden = true;
  resolveSetup(players);
}

function submit() {
  const players = readNames().map((name, i) => ({ name, avatar: draftAvatars[i] }));
  const problem = validatePlayers(players);
  if (problem) {
    showError(problem);
    return;
  }
  showError("");
  closePicker();
  submitBtn.disabled = true;
  api
    .newGame(players)
    .then(finish)
    .catch((err) => showError(errorMessage(err)))
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
cancelBtn.addEventListener("click", () => finish(null));
namesStep.addEventListener("submit", (event) => {
  event.preventDefault();
  submit();
});
picker.addEventListener("click", (event) => {
  const choice = event.target.closest(".avatar-choice");
  if (choice) chooseAvatar(choice.dataset.avatar);
});

renderPicker();

/** Shows the setup modal; resolves with the new players, or null if cancelled. */
export function open() {
  setCount(count);
  countStep.hidden = false;
  namesStep.hidden = true;
  backdrop.hidden = false;
  return new Promise((resolve) => {
    resolveSetup = resolve;
  });
}
