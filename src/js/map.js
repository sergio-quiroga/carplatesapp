/**
 * Renders the US states map (paths pre-built from the us-atlas Albers
 * topojson by scripts/build-map.mjs) with pan/zoom and exposes hooks for
 * coloring states and handling clicks.
 */
import { select } from "d3-selection";
import { zoom as d3Zoom } from "d3-zoom";

import { MAP_HEIGHT, MAP_SHAPES, MAP_WIDTH } from "./map-shapes.js";
import { CODE_BY_FIPS } from "./states.js";

const pathsByCode = new Map();
let onStateClick = null;

// Statuses returned by the game (besides "none") and their CSS classes.
const STATUS_CLASSES = ["status-some", "status-all"];

// Tiny states that overlap their neighbors at the default zoom level;
// their labels only appear once the user zooms in a bit.
const CROWDED_CODES = new Set(["RI", "CT", "MA", "VT", "NH", "NJ", "DE", "MD"]);
const CROWDED_ZOOM_THRESHOLD = 2.5;

export function init(options) {
  onStateClick = options.onStateClick;

  // Shapes in the map that aren't part of the game (e.g. Washington D.C.)
  // are drawn as plain gray background: no status, click or label.
  const inGame = (d) => CODE_BY_FIPS.has(d.fips);
  const width = MAP_WIDTH;
  const height = MAP_HEIGHT;

  const container = select("#map");
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
    .data(MAP_SHAPES)
    .join("path")
    .attr("class", (d) => "state-shape" + (inGame(d) ? "" : " state-shape-inactive"))
    .attr("d", (d) => d.d)
    .attr("data-code", (d) => CODE_BY_FIPS.get(d.fips) || "")
    .on("click", (event, d) => {
      const code = CODE_BY_FIPS.get(d.fips);
      if (code && onStateClick) onStateClick(code);
    })
    .each(function (d) {
      const code = CODE_BY_FIPS.get(d.fips);
      if (code) pathsByCode.set(code, this);
    });

  labelsGroup
    .selectAll("text")
    .data(MAP_SHAPES.filter(inGame))
    .join("text")
    .attr("class", (d) => {
      const code = CODE_BY_FIPS.get(d.fips);
      return "state-label" + (CROWDED_CODES.has(code) ? " state-label-crowded" : "");
    })
    .attr("transform", (d) => `translate(${d.centroid})`)
    .text((d) => d.name);

  const zoom = d3Zoom()
    .scaleExtent([1, 8])
    .translateExtent([[0, 0], [width, height]])
    .on("zoom", (event) => {
      zoomLayer.attr("transform", event.transform);
      labelsGroup.classed("zoomed-in", event.transform.k >= CROWDED_ZOOM_THRESHOLD);
    });

  svg.call(zoom);
}

export function updateStatuses(statusByCode) {
  pathsByCode.forEach((node, code) => {
    const status = statusByCode[code] || "none";
    node.classList.remove(...STATUS_CLASSES);
    if (status !== "none") {
      node.classList.add("status-" + status);
    }
  });
}
