import { beforeEach, describe, expect, it } from "vitest";

import {
  GameAlreadyConfigured,
  MAX_PLAYERS,
  NotFound,
  STORAGE_KEY,
  StateStatus,
  ValidationError,
  computeStatus,
  createGame,
} from "../../src/js/game.js";

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    get: async (key) => (key in data ? data[key] : null),
    set: async (key, value) => {
      data[key] = value;
    },
  };
}

// Clock that advances one second per call, so every mark gets its own time.
function fakeClock(start = "2026-01-01T12:00:00Z") {
  let t = new Date(start).getTime();
  return () => new Date((t += 1000));
}

const named = (names, avatar = "😎") => names.map((name) => ({ name, avatar }));

describe("computeStatus", () => {
  it("nobody", () => expect(computeStatus(0, 3)).toBe(StateStatus.NONE));
  it("some", () => expect(computeStatus(1, 3)).toBe(StateStatus.SOME));
  it("everyone", () => expect(computeStatus(3, 3)).toBe(StateStatus.ALL));
  it("single player", () => expect(computeStatus(1, 1)).toBe(StateStatus.ALL));
});

describe("player setup", () => {
  let storage;
  let game;

  beforeEach(() => {
    storage = memoryStorage();
    game = createGame(storage);
  });

  it("starts without players", async () => {
    expect(await game.getPlayers()).toEqual([]);
  });

  it("creates players in order, trimming names", async () => {
    const created = await game.setupPlayers(named(["Ana", "  Beto ", "Caro"]));
    expect(created.map((p) => p.name)).toEqual(["Ana", "Beto", "Caro"]);
    expect((await game.getPlayers()).map((p) => p.name)).toEqual(["Ana", "Beto", "Caro"]);
  });

  it("stores avatars", async () => {
    const created = await game.setupPlayers([
      { name: "Ana", avatar: "🤠" },
      { name: "Beto", avatar: "🤓" },
    ]);
    expect(created.map((p) => [p.name, p.avatar])).toEqual([
      ["Ana", "🤠"],
      ["Beto", "🤓"],
    ]);
  });

  it("rejects avatars outside the catalog", async () => {
    await expect(game.setupPlayers(named(["Ana"], "🍕"))).rejects.toThrow(ValidationError);
    await expect(game.setupPlayers(named(["Ana"], ""))).rejects.toThrow(ValidationError);
    expect(await game.getPlayers()).toEqual([]);
  });

  it("can only be done once", async () => {
    await game.setupPlayers(named(["Ana"]));
    await expect(game.setupPlayers(named(["Beto"]))).rejects.toThrow(GameAlreadyConfigured);
    expect((await game.getPlayers()).map((p) => p.name)).toEqual(["Ana"]);
  });

  it("rejects duplicate names, case-insensitively", async () => {
    await expect(game.setupPlayers(named(["Ana", "ana"]))).rejects.toThrow(
      'El nombre "ana" está repetido.'
    );
    expect(await game.getPlayers()).toEqual([]);
  });

  it("rejects an empty list, blank names and too many players", async () => {
    await expect(game.setupPlayers([])).rejects.toThrow(ValidationError);
    await expect(game.setupPlayers(named(["Ana", "  "]))).rejects.toThrow(
      "Escribe el nombre de cada jugador."
    );
    const tooMany = Array.from({ length: MAX_PLAYERS + 1 }, (_, i) => `Jugador ${i}`);
    await expect(game.setupPlayers(named(tooMany))).rejects.toThrow(ValidationError);
  });
});

describe("sightings", () => {
  let storage;
  let game;
  let ana;
  let beto;

  beforeEach(async () => {
    storage = memoryStorage();
    game = createGame(storage, { now: fakeClock() });
    [ana, beto] = await game.setupPlayers([
      { name: "Ana", avatar: "🤠" },
      { name: "Beto", avatar: "😀" },
    ]);
  });

  it("a state starts unseen", async () => {
    const data = await game.getState("CA");
    expect(data.status).toBe("none");
    expect(data.players.map((p) => p.seen)).toEqual([false, false]);
  });

  it("one player gives 'some' status", async () => {
    await game.setSighting("CA", ana.id, true);
    const data = await game.getState("CA");
    expect(data.status).toBe("some");
    expect(data.players.map((p) => [p.name, p.seen])).toEqual([
      ["Ana", true],
      ["Beto", false],
    ]);
    expect(data.players[0].avatar).toBe("🤠");
  });

  it("every player gives 'all' status", async () => {
    await game.setSighting("CA", ana.id, true);
    const data = await game.setSighting("CA", beto.id, true);
    expect(data.status).toBe("all");
  });

  it("the list reports status and seen_by", async () => {
    await game.setSighting("CA", beto.id, true);
    const states = Object.fromEntries((await game.getStates()).map((s) => [s.code, s]));
    expect(Object.keys(states)).toHaveLength(50);
    expect(states.CA).toMatchObject({ status: "some", seen_by: [beto.id] });
    expect(states.TX).toMatchObject({ status: "none", seen_by: [] });
  });

  it("unmarking removes the sighting", async () => {
    await game.setSighting("CA", ana.id, true);
    const data = await game.setSighting("CA", ana.id, false);
    expect(data.players[0]).toMatchObject({ seen: false, first_seen: null });
    expect(data.status).toBe("none");
  });

  it("unknown player or state throws NotFound", async () => {
    await expect(game.setSighting("CA", 9999, true)).rejects.toThrow(NotFound);
    await expect(game.getState("ZZ")).rejects.toThrow(NotFound);
    await expect(game.getState("DC")).rejects.toThrow(NotFound);
  });

  it("state codes are case-insensitive", async () => {
    expect((await game.getState("ca")).code).toBe("CA");
  });

  it("re-marking is a no-op and keeps first_seen", async () => {
    const first = await game.setSighting("CA", ana.id, true);
    const second = await game.setSighting("CA", ana.id, true);
    expect(second.players[0].first_seen).toBe(first.players[0].first_seen);
  });

  it("reset clears players and sightings", async () => {
    await game.setSighting("CA", ana.id, true);
    await game.resetGame();
    expect(await game.getPlayers()).toEqual([]);
    expect((await game.getStates()).every((s) => s.status === "none")).toBe(true);
    // Players can be set up again afterwards.
    await game.setupPlayers(named(["Caro"]));
    expect((await game.getPlayers()).map((p) => p.name)).toEqual(["Caro"]);
  });
});

describe("storage", () => {
  it("survives restarting the app", async () => {
    const storage = memoryStorage();
    const first = createGame(storage);
    const [ana] = await first.setupPlayers(named(["Ana"]));
    await first.setSighting("TX", ana.id, true);

    const second = createGame(storage);
    expect((await second.getPlayers()).map((p) => p.name)).toEqual(["Ana"]);
    expect((await second.getState("TX")).status).toBe("all");
  });

  it("keeps the previous data when saving fails", async () => {
    const storage = memoryStorage();
    const game = createGame(storage);
    const [ana] = await game.setupPlayers(named(["Ana"]));
    storage.set = async () => {
      throw new Error("disk full");
    };
    await expect(game.setSighting("TX", ana.id, true)).rejects.toThrow("disk full");
    expect((await game.getState("TX")).status).toBe("none");
  });

  it("runs operations in order", async () => {
    const storage = memoryStorage();
    const game = createGame(storage);
    const [ana] = await game.setupPlayers(named(["Ana"]));
    // Fired without awaiting: the last one must win.
    game.setSighting("TX", ana.id, true);
    game.setSighting("TX", ana.id, false);
    const last = game.setSighting("TX", ana.id, true);
    expect((await last).status).toBe("all");
    expect(JSON.parse(storage.data[STORAGE_KEY]).sightings.TX).toHaveProperty(String(ana.id));
  });

  it("refuses data from an unknown version instead of overwriting it", async () => {
    const raw = JSON.stringify({ version: 99, players: [] });
    const storage = memoryStorage({ [STORAGE_KEY]: raw });
    const game = createGame(storage);
    await expect(game.getPlayers()).rejects.toThrow();
    expect(storage.data[STORAGE_KEY]).toBe(raw);
  });
});
