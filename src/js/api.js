/**
 * The game instance the UI talks to, stored on the device.
 *
 * Capacitor Preferences keeps the data in iOS UserDefaults: native storage
 * that iOS never clears on its own (unlike the WebView's localStorage or
 * IndexedDB) and that is included in the iPhone's iCloud/computer backups.
 * In a desktop browser the same plugin falls back to localStorage.
 */
import { Preferences } from "@capacitor/preferences";

import { createGame } from "./game.js";

const preferencesStorage = {
  get: (key) => Preferences.get({ key }).then((result) => result.value),
  set: (key, value) => Preferences.set({ key, value }),
};

export const api = createGame(preferencesStorage);
