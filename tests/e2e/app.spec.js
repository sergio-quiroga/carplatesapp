import { expect, test } from "@playwright/test";

// Each test gets a fresh browser context, so the saved game starts empty.

async function setupPlayers(page, names) {
  await page.goto("/");
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

test("first launch asks for players, then shows the scoreboard", async ({ page }) => {
  await setupPlayers(page, ["Ana", "Beto"]);
  await expect(legendCount(page, "Sin ver")).toHaveText("50");
  await expect(legendCount(page, "Ana")).toHaveText("0");
  await expect(legendCount(page, "Todos")).toHaveText("0");
  await expect(page.locator("#map path.state-shape")).toHaveCount(51);
});

test("setup rejects repeated names", async ({ page }) => {
  await page.goto("/");
  await page.click("#setup-step-count button[type=submit]");
  const inputs = page.locator("#setup-names input");
  await inputs.nth(0).fill("Ana");
  await inputs.nth(1).fill("ana");
  await page.click("#setup-submit");
  await expect(page.locator("#setup-error")).toHaveText('El nombre "ana" está repetido.');
  await expect(page.locator("#setup-backdrop")).toBeVisible();
});

test("marking plates colors the map, and progress survives a restart", async ({ page }) => {
  await setupPlayers(page, ["Ana", "Beto"]);

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
  await expect(page.locator("#setup-backdrop")).toBeHidden();
  await expect(legendCount(page, "Todos")).toHaveText("1");
  await expect(page.locator("path[data-code=CA]")).toHaveClass(/status-all/);
});

test("unmarking asks for confirmation", async ({ page }) => {
  await setupPlayers(page, ["Ana"]);
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

test("a new game wipes everything and asks for players again", async ({ page }) => {
  await setupPlayers(page, ["Ana"]);
  await openState(page, "NY");
  await option(page, "Ana").check();
  await expect(option(page, "Ana")).toBeEnabled();
  await page.click("#modal-close");

  page.once("dialog", (dialog) => dialog.dismiss());
  await page.click("#new-game");
  await expect(legendCount(page, "Ana")).toHaveText("1");

  page.once("dialog", (dialog) => dialog.accept());
  await page.click("#new-game");
  await expect(page.locator("#setup-backdrop")).toBeVisible();
  await expect(page.locator("path[data-code=NY]")).not.toHaveClass(/status-/);

  await page.click("#setup-step-count button[type=submit]");
  const inputs = page.locator("#setup-names input");
  await inputs.nth(0).fill("Caro");
  await inputs.nth(1).fill("Dani");
  await page.click("#setup-submit");
  await expect(legendCount(page, "Caro")).toHaveText("0");
  await expect(legendCount(page, "Sin ver")).toHaveText("50");
});

test("works without network", async ({ page, context }) => {
  await page.goto("/");
  await context.setOffline(true);
  await page.click("#setup-step-count button[type=submit]");
  const inputs = page.locator("#setup-names input");
  await inputs.nth(0).fill("Ana");
  await inputs.nth(1).fill("Beto");
  await page.click("#setup-submit");
  await openState(page, "WA");
  await option(page, "Beto").check();
  await expect(page.locator("path[data-code=WA]")).toHaveClass(/status-some/);
});
