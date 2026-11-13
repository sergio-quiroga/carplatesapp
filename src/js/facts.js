/**
 * Interesting facts unlocked when every player has spotted a state's plate.
 *
 * To add a state's fact, put an entry in FACTS keyed by its postal code:
 *
 *   CA: { text: "…", image: californiaImage },
 *
 * with the picture imported from src/assets/facts/. States without an entry
 * show the placeholder below.
 */
import placeholderImage from "../assets/facts/placeholder.svg";
import { STATE_BY_CODE } from "./states.js";

const FACTS = {};

const backdrop = document.getElementById("fact-backdrop");
const closeBtn = document.getElementById("fact-close");
const titleEl = document.getElementById("fact-state-name");
const imageEl = document.getElementById("fact-image");
const textEl = document.getElementById("fact-text");

/** @returns {{text: string, image: string}} */
export function getFact(code) {
  const name = STATE_BY_CODE.get(code).name;
  return FACTS[code] || { text: `Aquí irá un dato interesante de ${name}.`, image: placeholderImage };
}

export function isOpen() {
  return !backdrop.hidden;
}

export function open(code) {
  const fact = getFact(code);
  titleEl.textContent = STATE_BY_CODE.get(code).name;
  imageEl.src = fact.image;
  textEl.textContent = fact.text;
  backdrop.hidden = false;
  closeBtn.focus();
}

export function close() {
  backdrop.hidden = true;
}

closeBtn.addEventListener("click", close);
backdrop.addEventListener("click", (event) => {
  if (event.target === backdrop) close();
});
