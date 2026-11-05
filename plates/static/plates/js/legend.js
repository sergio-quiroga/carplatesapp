/**
 * Legend under the map, doubling as a scoreboard: "Sin ver", one entry per
 * player with how many plates they have spotted, and "Todos".
 */
(function () {
  "use strict";

  const listEl = document.getElementById("legend");

  function item(className, label, count, marker) {
    const li = document.createElement("li");
    li.className = "legend-item " + className;
    li.appendChild(marker);

    const text = document.createElement("span");
    text.className = "legend-label";
    text.textContent = label;
    li.appendChild(text);

    const badge = document.createElement("span");
    badge.className = "legend-count";
    badge.textContent = count;
    li.appendChild(badge);
    return li;
  }

  function swatch(status) {
    const el = document.createElement("span");
    el.className = "swatch swatch-" + status;
    return el;
  }

  /** Player's face emoji in a circle (falls back to their initial). */
  function avatar(player) {
    const el = document.createElement("span");
    el.className = "avatar";
    el.textContent = player.avatar || player.name.trim().charAt(0).toUpperCase();
    el.setAttribute("aria-hidden", "true");
    return el;
  }

  /**
   * @param {Array<{id:number,name:string,avatar:string}>} players
   * @param {Array<{status:string,seen_by:number[]}>} states
   */
  function render(players, states) {
    const countByPlayer = new Map(players.map((p) => [p.id, 0]));
    let none = 0;
    let all = 0;
    states.forEach((s) => {
      if (s.status === "none") none += 1;
      if (s.status === "all") all += 1;
      s.seen_by.forEach((id) => {
        if (countByPlayer.has(id)) countByPlayer.set(id, countByPlayer.get(id) + 1);
      });
    });

    const items = [item("legend-none", "Sin ver", none, swatch("none"))];
    players.forEach((p) => {
      items.push(item("legend-player", p.name, countByPlayer.get(p.id), avatar(p)));
    });
    items.push(item("legend-all", "Todos", all, swatch("all")));
    listEl.replaceChildren(...items);
  }

  window.USAPLATESLegend = { render, avatar };
})();
