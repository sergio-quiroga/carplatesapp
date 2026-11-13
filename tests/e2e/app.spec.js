import { expect, test } from "@playwright/test";

// Each test gets a fresh browser context, so the saved game starts empty.

function menuButton(page, label) {
  return page.locator("#home-menu .home-btn", { hasText: label });
}

async function fillSetup(page, names) {
  await expect(page.locator("#setup-backdrop")).toBeVisible();
  const count = page.locator("#setup-count");
  while (Number(await count.textContent()) < names.length) await page.click("#setup-count-inc");
  while (Number(await count.textContent()) > names.length) await page.click("#setup-count-dec");
  await page.click("#setup-step-count button[type=submit]");
  const inputs = page.locator("#setup-names input");
  for (const [i, name] of names.entries()) await inputs.nth(i).fill(name);
  await page.click("#setup-submit");
  await expect(page.locator("#setup-backdrop")).toBeHidden();
}

async function startGame(page, names) {
  await page.goto("/");
  await menuButton(page, "Juego nuevo").click();
  await fillSetup(page, names);
}

function legendCount(page, label) {
  return page.locator(".legend-item", { hasText: label }).locator(".legend-count");
}

async function openState(page, code) {
  // dispatchEvent: on the phone viewport small states may sit under labels.
  await page.locator(`path[data-code=${code}]`).dispatchEvent("click");
  await expect(page.locator("#modal-backdrop")).toBeVisible();
  await expect(page.locator("#modal-loading")).toBeHidden();
}

function option(page, name) {
  return page.locator(".option", { hasText: name }).locator("input");
}

test("first launch shows the home menu without Continuar", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#home")).toBeVisible();
  await expect(page.locator(".home-logo")).toBeVisible();
  await expect(page.locator("#home-menu .home-btn:visible")).toHaveText([
    "Juego nuevo",
    "Opciones",
    "Salir",
  ]);
  await expect(page.locator("#setup-backdrop")).toBeHidden();
});

test("Juego nuevo asks for players, then shows the scoreboard", async ({ page }) => {
  await startGame(page, ["Ana", "Beto"]);
  await expect(page.locator("#home")).toBeHidden();
  await expect(legendCount(page, "Sin ver")).toHaveText("50");
  await expect(legendCount(page, "Ana")).toHaveText("0");
  await expect(legendCount(page, "Todos")).toHaveText("0");
  await expect(page.locator("#map path.state-shape")).toHaveCount(51);
});

test("Atrás in the setup goes back to the menu", async ({ page }) => {
  await page.goto("/");
  await menuButton(page, "Juego nuevo").click();
  await page.click("#setup-cancel");
  await expect(page.locator("#setup-backdrop")).toBeHidden();
  await expect(page.locator("#home")).toBeVisible();
});

test("Opciones and Salir stay on the home screen", async ({ page }) => {
  await page.goto("/");
  await menuButton(page, "Opciones").click();
  await expect(page.locator("#home-options")).toBeVisible();
  await expect(page.locator("#home-menu")).toBeHidden();
  await page.locator("#home-options button", { hasText: "Volver" }).click();
  await expect(page.locator("#home-menu")).toBeVisible();

  await menuButton(page, "Salir").click();
  await expect(page.locator("#home-exit-hint")).toBeVisible();
  await expect(page.locator("#home")).toBeVisible();
});

test("setup rejects repeated names", async ({ page }) => {
  await page.goto("/");
  await menuButton(page, "Juego nuevo").click();
  await page.click("#setup-step-count button[type=submit]");
  const inputs = page.locator("#setup-names input");
  await inputs.nth(0).fill("Ana");
  await inputs.nth(1).fill("ana");
  await page.click("#setup-submit");
  await expect(page.locator("#setup-error")).toHaveText('El nombre "ana" está repetido.');
  await expect(page.locator("#setup-backdrop")).toBeVisible();
});

test("marking plates colors the map, and reopening the app offers Continuar", async ({ page }) => {
  await startGame(page, ["Ana", "Beto"]);

  await openState(page, "CA");
  await expect(page.locator("#modal-state-name")).toHaveText("California");
  await option(page, "Ana").check();
  await expect(page.locator("path[data-code=CA]")).toHaveClass(/status-some/);
  await expect(page.locator("#modal-dates-list li")).toHaveCount(1);

  await option(page, "Beto").check();
  await expect(page.locator("path[data-code=CA]")).toHaveClass(/status-all/);
  await page.click("#modal-close");

  await expect(legendCount(page, "Sin ver")).toHaveText("49");
  await expect(legendCount(page, "Ana")).toHaveText("1");
  await expect(legendCount(page, "Todos")).toHaveText("1");

  await page.reload();
  await expect(page.locator("#home")).toBeVisible();
  await expect(page.locator("#home-menu .home-btn:visible")).toHaveText([
    "Continuar",
    "Juego nuevo",
    "Opciones",
    "Salir",
  ]);
  await menuButton(page, "Continuar").click();
  await expect(page.locator("#home")).toBeHidden();
  await expect(legendCount(page, "Todos")).toHaveText("1");
  await expect(page.locator("path[data-code=CA]")).toHaveClass(/status-all/);
});

test("completing a state unlocks its fact", async ({ page }) => {
  await startGame(page, ["Ana", "Beto"]);
  await openState(page, "OR");
  const unlock = page.locator("#fact-unlock");
  await expect(unlock).toBeHidden();

  await option(page, "Ana").check();
  await expect(option(page, "Ana")).toBeEnabled();
  await expect(unlock).toBeHidden();

  await option(page, "Beto").check();
  await expect(unlock).toBeVisible();
  await unlock.click();
  await expect(page.locator("#fact-backdrop")).toBeVisible();
  await expect(page.locator("#fact-state-name")).toHaveText("Oregon");
  await expect(page.locator("#fact-text")).toHaveText("Aquí irá un dato interesante de Oregon.");
  await expect(page.locator("#fact-image")).toHaveJSProperty("complete", true);

  // Closing the fact goes back to the state.
  await page.click("#fact-close");
  await expect(page.locator("#fact-backdrop")).toBeHidden();
  await expect(page.locator("#modal-backdrop")).toBeVisible();

  // Unmarking someone locks it again; another state shows no button.
  page.once("dialog", (dialog) => dialog.accept());
  await option(page, "Beto").click();
  await expect(unlock).toBeHidden();
  await page.click("#modal-close");
  await openState(page, "TX");
  await expect(unlock).toBeHidden();
});

test("unmarking asks for confirmation", async ({ page }) => {
  await startGame(page, ["Ana"]);
  await openState(page, "TX");
  await option(page, "Ana").check();
  await expect(page.locator("path[data-code=TX]")).toHaveClass(/status-all/);

  page.once("dialog", (dialog) => dialog.dismiss());
  await option(page, "Ana").click();
  await expect(option(page, "Ana")).toBeChecked();

  page.once("dialog", (dialog) => dialog.accept());
  await option(page, "Ana").click();
  await expect(option(page, "Ana")).not.toBeChecked();
  await expect(page.locator("path[data-code=TX]")).not.toHaveClass(/status-/);
  await expect(page.locator("#modal-empty")).toBeVisible();
});

test("Juego nuevo over a game in progress confirms, and Atrás keeps the old game", async ({ page }) => {
  await startGame(page, ["Ana"]);
  await openState(page, "NY");
  await option(page, "Ana").check();
  await expect(option(page, "Ana")).toBeEnabled();
  await page.click("#modal-close");

  // Declining the confirmation goes back to the menu.
  await page.click("#open-menu");
  page.once("dialog", (dialog) => dialog.dismiss());
  await menuButton(page, "Juego nuevo").click();
  await expect(page.locator("#home")).toBeVisible();

  // Accepting, then backing out of the setup, still keeps the game.
  page.once("dialog", (dialog) => dialog.accept());
  await menuButton(page, "Juego nuevo").click();
  await page.click("#setup-cancel");
  await menuButton(page, "Continuar").click();
  await expect(legendCount(page, "Ana")).toHaveText("1");

  // Finishing the setup replaces the game.
  await page.click("#open-menu");
  page.once("dialog", (dialog) => dialog.accept());
  await menuButton(page, "Juego nuevo").click();
  await fillSetup(page, ["Caro", "Dani"]);
  await expect(legendCount(page, "Caro")).toHaveText("0");
  await expect(legendCount(page, "Sin ver")).toHaveText("50");
  await expect(page.locator("path[data-code=NY]")).not.toHaveClass(/status-/);
});

test("works without network", async ({ page, context }) => {
  await page.goto("/");
  await context.setOffline(true);
  await menuButton(page, "Juego nuevo").click();
  await fillSetup(page, ["Ana", "Beto"]);
  await openState(page, "WA");
  await option(page, "Beto").check();
  await expect(page.locator("path[data-code=WA]")).toHaveClass(/status-some/);
});
