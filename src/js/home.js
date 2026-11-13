/**
 * Home screen with the main menu, shown every time the app opens. "Opciones"
 * and "Salir" are handled here; "Continuar" and "Juego nuevo" are handed back
 * to the app controller.
 */
const homeEl = document.getElementById("home");
const menu = document.getElementById("home-menu");
const optionsPanel = document.getElementById("home-options");
const exitHint = document.getElementById("home-exit-hint");
const continueBtn = menu.querySelector("[data-action=continue]");
const newBtn = menu.querySelector("[data-action=new]");
// Everything behind the home screen, kept out of reach while it's open.
const background = document.querySelectorAll("body > header, body > main");

let resolveChoice = null;

function showMenu() {
  optionsPanel.hidden = true;
  menu.hidden = false;
}

function close(choice) {
  homeEl.hidden = true;
  background.forEach((el) => (el.inert = false));
  resolveChoice(choice);
}

homeEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  switch (button.dataset.action) {
    case "continue":
    case "new":
      close(button.dataset.action);
      break;
    case "options":
      exitHint.hidden = true;
      menu.hidden = true;
      optionsPanel.hidden = false;
      break;
    case "back":
      showMenu();
      break;
    case "exit":
      // iOS apps can't close themselves (Apple rejects apps that try), so
      // explain how to leave instead. Progress is saved after every change.
      exitHint.hidden = false;
      break;
  }
});

/**
 * Shows the home screen and resolves with "continue" or "new".
 * @param {{hasGame: boolean}} options
 */
export function open({ hasGame }) {
  continueBtn.hidden = !hasGame;
  continueBtn.classList.toggle("btn-primary", hasGame);
  newBtn.classList.toggle("btn-primary", !hasGame);
  exitHint.hidden = true;
  showMenu();
  background.forEach((el) => (el.inert = true));
  homeEl.hidden = false;
  return new Promise((resolve) => {
    resolveChoice = resolve;
  });
}
