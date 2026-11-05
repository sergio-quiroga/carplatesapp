/**
 * Renders the US states map (pre-projected Albers topojson from us-atlas)
 * with pan/zoom and exposes hooks for coloring states and handling clicks.
 */
(function () {
  "use strict";

  const config = window.USAPLATES;
  let pathsByCode = new Map();
  let onStateClick = null;

  // Statuses returned by the API (besides "none") and their CSS classes.
  const STATUS_CLASSES = ["status-some", "status-all"];

  // Tiny states that overlap their neighbors at the default zoom level;
  // their labels only appear once the user zooms in a bit.
  const CROWDED_CODES = new Set(["RI", "CT", "MA", "VT", "NH", "NJ", "DE", "MD"]);
  const CROWDED_ZOOM_THRESHOLD = 2.5;

  function init(options) {
    onStateClick = options.onStateClick;

    return d3.json(config.statesTopoUrl).then((topology) => {
      const fipsToCode = JSON.parse(document.getElementById("fips-to-code").textContent);
      const geo = topojson.feature(topology, topology.objects.states);
      // Shapes in the topojson that aren't part of the game (e.g. Washington
      // D.C.) are drawn as plain gray background: no status, click or label.
      const inGame = (d) => d.id in fipsToCode;

      const pathGen = d3.geoPath();
      const [[x0, y0], [x1, y1]] = pathGen.bounds(geo);
      const width = Math.ceil(x1);
      const height = Math.ceil(y1);

      const container = d3.select("#map");
      const svg = container
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-label", "Mapa de Estados Unidos");

      const zoomLayer = svg.append("g").attr("class", "zoom-layer");
      const statesGroup = zoomLayer.append("g").attr("class", "states");
      const labelsGroup = zoomLayer.append("g").attr("class", "labels");

      statesGroup
        .selectAll("path")
        .data(geo.features)
        .join("path")
        .attr("class", (d) => "state-shape" + (inGame(d) ? "" : " state-shape-inactive"))
        .attr("d", pathGen)
        .attr("data-code", (d) => fipsToCode[d.id] || "")
        .on("click", (event, d) => {
          const code = fipsToCode[d.id];
          if (code && onStateClick) onStateClick(code);
        })
        .each(function (d) {
          const code = fipsToCode[d.id];
          if (code) pathsByCode.set(code, this);
        });

      labelsGroup
        .selectAll("text")
        .data(geo.features.filter(inGame))
        .join("text")
        .attr("class", (d) => {
          const code = fipsToCode[d.id];
          return "state-label" + (CROWDED_CODES.has(code) ? " state-label-crowded" : "");
        })
        .attr("transform", (d) => `translate(${pathGen.centroid(d)})`)
        .text((d) => d.properties.name);

      const zoom = d3
        .zoom()
        .scaleExtent([1, 8])
        .translateExtent([[0, 0], [width, height]])
        .on("zoom", (event) => {
          zoomLayer.attr("transform", event.transform);
          labelsGroup.classed("zoomed-in", event.transform.k >= CROWDED_ZOOM_THRESHOLD);
        });

      svg.call(zoom);
    });
  }

  function updateStatuses(statusByCode) {
    pathsByCode.forEach((node, code) => {
      const status = statusByCode[code] || "none";
      node.classList.remove(...STATUS_CLASSES);
      if (status !== "none") {
        node.classList.add("status-" + status);
      }
    });
  }

  window.USAPLATESMap = { init, updateStatuses };
})();
