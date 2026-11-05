/**
 * Thin client for the backend REST API. Every call resolves with the parsed
 * JSON body or rejects with an ApiError carrying the HTTP status and body.
 */
(function () {
  "use strict";

  const config = window.USAPLATES;

  class ApiError extends Error {
    constructor(status, body) {
      super("HTTP " + status);
      this.status = status;
      this.body = body;
    }
  }

  function getCsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function request(url, options) {
    const opts = Object.assign({ cache: "no-store" }, options);
    opts.headers = Object.assign({ Accept: "application/json" }, opts.headers);
    // DRF enforces CSRF on unsafe methods when an admin session is active.
    if (opts.method && opts.method !== "GET") {
      opts.headers["X-CSRFToken"] = getCsrfToken();
    }
    if (opts.body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(opts.body);
    }
    return fetch(url, opts).then((r) =>
      r
        .json()
        .catch(() => null)
        .then((body) => {
          if (!r.ok) throw new ApiError(r.status, body);
          return body;
        })
    );
  }

  function stateDetailUrl(code) {
    return config.apiStateDetailUrl.replace("__CODE__", code);
  }

  function sightingUrl(code, playerId) {
    // The template reverses the URL with player_id=0 as a placeholder.
    return config.apiSightingUrl
      .replace("__CODE__", code)
      .replace(/\/0\/$/, "/" + encodeURIComponent(playerId) + "/");
  }

  window.USAPLATESApi = {
    ApiError,
    getPlayers: () => request(config.apiPlayersUrl),
    /** @param {Array<{name:string,avatar:string}>} players */
    setupPlayers: (players) => request(config.apiPlayersUrl, { method: "POST", body: { players } }),
    getStates: () => request(config.apiStatesUrl),
    getState: (code) => request(stateDetailUrl(code)),
    setSighting: (code, playerId, seen) =>
      request(sightingUrl(code, playerId), { method: seen ? "PUT" : "DELETE" }),
  };
})();
