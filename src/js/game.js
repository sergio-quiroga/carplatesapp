/**
 * Game rules and the local database. Replaces the old Django backend: the
 * functions return the same shapes the REST API did, so the UI modules
 * barely changed.
 *
 * The whole game is one small JSON document kept under a single storage key:
 *
 *   {
 *     version: 1,
 *     players: [{ id, name, avatar }],            // in setup order
 *     sightings: { CA: { "1": "2026-…Z" }, … }    // state -> player id -> first seen
 *   }
 *
 * A sighting existing means that player has seen that state's plate.
 */
import { AVATARS } from "./avatars.js";
import { STATES, STATE_BY_CODE } from "./states.js";

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 12;
export const PLAYER_NAME_MAX_LENGTH = 30;

/** How much of the group has spotted a state's plate. Drives map colors. */
export const StateStatus = Object.freeze({ NONE: "none", SOME: "some", ALL: "all" });

export const STORAGE_KEY = "usaplates.game";
// Bump when the document shape changes and upgrade old documents in parse().
const SCHEMA_VERSION = 1;

export class ValidationError extends Error {}
/** Players can only be set up once; a second setup would orphan sightings. */
export class GameAlreadyConfigured extends Error {}
export class NotFound extends Error {}

export function computeStatus(seenCount, playerCount) {
  if (seenCount === 0) return StateStatus.NONE;
  if (seenCount >= playerCount) return StateStatus.ALL;
  return StateStatus.SOME;
}

/**
 * Checks a setup request; returns an error message, or "" when it's valid.
 * Names are expected already trimmed.
 * @param {Array<{name:string,avatar:string}>} players
 */
export function validatePlayers(players) {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    return `Puede haber entre ${MIN_PLAYERS} y ${MAX_PLAYERS} jugadores.`;
  }
  if (players.some((p) => !p.name)) return "Escribe el nombre de cada jugador.";
  const seen = new Set();
  for (const { name, avatar } of players) {
    if (name.length > PLAYER_NAME_MAX_LENGTH) return `El nombre "${name}" es demasiado largo.`;
    if (!AVATARS.includes(avatar)) return "Elige una de las caras disponibles.";
    const key = name.toLocaleLowerCase("es");
    if (seen.has(key)) return `El nombre "${name}" está repetido.`;
    seen.add(key);
  }
  return "";
}

function emptyDocument() {
  return { version: SCHEMA_VERSION, players: [], sightings: {} };
}

function parse(raw) {
  if (!raw) return emptyDocument();
  const doc = JSON.parse(raw);
  if (doc.version !== SCHEMA_VERSION) {
    throw new Error(`Versión de datos desconocida: ${doc.version}`);
  }
  return doc;
}

/**
 * @param {{get(key:string):Promise<string|null>, set(key:string, value:string):Promise<void>}} storage
 * @param {{now?: () => Date}} [options]
 */
export function createGame(storage, { now = () => new Date() } = {}) {
  let doc = null;
  // Every operation runs after the previous one, so writes never interleave.
  let queue = Promise.resolve();

  function enqueue(operation) {
    const run = queue.then(async () => {
      if (!doc) doc = parse(await storage.get(STORAGE_KEY));
      return operation();
    });
    queue = run.catch(() => {});
    return run;
  }

  // Applies `change` to a copy and only adopts it once it's safely stored.
  async function commit(change) {
    const next = JSON.parse(JSON.stringify(doc));
    change(next);
    await storage.set(STORAGE_KEY, JSON.stringify(next));
    doc = next;
  }

  function getStateOrThrow(code) {
    const state = STATE_BY_CODE.get(String(code).toUpperCase());
    if (!state) throw new NotFound(`Estado '${code}' no existe.`);
    return state;
  }

  function seenByState(code) {
    return doc.sightings[code] || {};
  }

  function playerSummary({ id, name, avatar }) {
    return { id, name, avatar };
  }

  function stateDetail(state) {
    const seen = seenByState(state.code);
    return {
      code: state.code,
      name: state.name,
      status: computeStatus(Object.keys(seen).length, doc.players.length),
      players: doc.players.map((p) => ({
        ...playerSummary(p),
        seen: p.id in seen,
        first_seen: seen[p.id] || null,
      })),
    };
  }

  return {
    /** Players in setup order (`[]` until the game is set up). */
    getPlayers: () => enqueue(() => doc.players.map(playerSummary)),

    /**
     * Initial setup: creates the whole group at once.
     * @param {Array<{name:string,avatar:string}>} players
     */
    setupPlayers: (players) =>
      enqueue(async () => {
        const entries = players.map((p) => ({ name: String(p.name).trim(), avatar: p.avatar }));
        const problem = validatePlayers(entries);
        if (problem) throw new ValidationError(problem);
        if (doc.players.length) throw new GameAlreadyConfigured();
        await commit((next) => {
          next.players = entries.map((p, i) => ({ id: i + 1, ...p }));
        });
        return doc.players.map(playerSummary);
      }),

    /** Every state with its `status` and `seen_by` (ids of who saw it). */
    getStates: () =>
      enqueue(() =>
        STATES.map((state) => {
          const seen = seenByState(state.code);
          return {
            code: state.code,
            name: state.name,
            status: computeStatus(Object.keys(seen).length, doc.players.length),
            seen_by: doc.players.filter((p) => p.id in seen).map((p) => p.id),
          };
        })
      ),

    /** One state with every player's `seen` flag and `first_seen` date. */
    getState: (code) => enqueue(() => stateDetail(getStateOrThrow(code))),

    /** Marks (seen=true) or unmarks a sighting and returns the state detail. */
    setSighting: (code, playerId, seen) =>
      enqueue(async () => {
        const state = getStateOrThrow(code);
        if (!doc.players.some((p) => p.id === playerId)) {
          throw new NotFound(`Jugador '${playerId}' no existe.`);
        }
        const already = playerId in seenByState(state.code);
        // Re-marking keeps the original date; unmarking an unseen plate is a no-op.
        if (seen !== already) {
          await commit((next) => {
            const byPlayer = next.sightings[state.code] || {};
            if (seen) byPlayer[playerId] = now().toISOString();
            else delete byPlayer[playerId];
            if (Object.keys(byPlayer).length) next.sightings[state.code] = byPlayer;
            else delete next.sightings[state.code];
          });
        }
        return stateDetail(state);
      }),

    /** Deletes every player and sighting so the group can be set up again. */
    resetGame: () => enqueue(() => commit((next) => Object.assign(next, emptyDocument()))),
  };
}
