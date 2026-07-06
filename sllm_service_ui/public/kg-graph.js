const svg = document.querySelector("#kgGraph");
const detailPanel = document.querySelector("#detailPanel");
const filterButtons = Array.from(document.querySelectorAll(".filter-button"));

const GROUP_COLOR = {
  clinical: "#dce8f5",
  task: "#f0e6cc",
  behavior: "#dceee9",
  pi: "#f1e0e8",
  evidence: "#ebedcf",
  guardrail: "#f2dedb",
};

const GROUP_STROKE = {
  clinical: "#476a92",
  task: "#7f6b3b",
  behavior: "#327064",
  pi: "#8b5f75",
  evidence: "#6d6f38",
  guardrail: "#9b5247",
};

const LAYER_X = {
  clinical: 90,
  task: 310,
  behavior: 530,
  pi: 760,
  evidence: 995,
  guardrail: 995,
};

const NODE_WIDTH = {
  clinical: 170,
  task: 145,
  behavior: 185,
  pi: 190,
  evidence: 145,
  guardrail: 165,
};

let graph = null;
let selectedFilter = "all";

function el(name, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }
  return node;
}

function wrapText(text, maxChars = 21) {
  const raw = String(text || "");
  if (raw.length <= maxChars) {
    return [raw];
  }

  const words = raw.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (`${current} ${word}`.length <= maxChars) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) {
    lines.push(current);
  }

  if (lines.length === 1 && lines[0].length > maxChars) {
    return [lines[0].slice(0, maxChars - 1), `${lines[0].slice(maxChars - 1, maxChars * 2 - 2)}...`];
  }
  return lines.slice(0, 2).map((line, index) => (index === 1 && lines.length > 2 ? `${line}...` : line));
}

function filterGraph(rawGraph, filter) {
  if (filter === "all") {
    return rawGraph;
  }

  const keep = new Set();
  const has = (value, needle) => String(value || "").toLowerCase().includes(needle);
  for (const node of rawGraph.nodes) {
    const blob = JSON.stringify(node).toLowerCase();
    if (
      (filter === "dsm" && (node.group === "clinical" || node.group === "guardrail")) ||
      (filter === "vst" && blob.includes("vst")) ||
      (filter === "flanker" && blob.includes("flanker"))
    ) {
      keep.add(node.id);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of rawGraph.edges) {
      if (keep.has(edge.source) && !keep.has(edge.target)) {
        keep.add(edge.target);
        changed = true;
      }
      if (keep.has(edge.target) && !keep.has(edge.source)) {
        keep.add(edge.source);
        changed = true;
      }
    }
  }

  return {
    ...rawGraph,
    nodes: rawGraph.nodes.filter((node) => keep.has(node.id)),
    edges: rawGraph.edges.filter((edge) => keep.has(edge.source) && keep.has(edge.target)),
  };
}

function layoutGraph(rawGraph) {
  const byLayer = new Map();
  for (const node of rawGraph.nodes) {
    const layer = node.layer || node.group || "behavior";
    if (!byLayer.has(layer)) {
      byLayer.set(layer, []);
    }
    byLayer.get(layer).push(node);
  }

  for (const [layer, nodes] of byLayer.entries()) {
    nodes.sort((a, b) => a.label.localeCompare(b.label));
    const top = 55;
    const gap = layer === "guardrail" ? 86 : 74;
    nodes.forEach((node, index) => {
      node.x = LAYER_X[layer] || 520;
      node.y = top + index * gap;
      node.width = NODE_WIDTH[layer] || 170;
      node.height = 48;
    });
  }

  return rawGraph;
}

function pathForEdge(source, target) {
  const sx = source.x + source.width;
  const sy = source.y + source.height / 2;
  const tx = target.x;
  const ty = target.y + target.height / 2;
  const dx = Math.max(50, (tx - sx) / 2);
  return `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDetailValue(value) {
  if (Array.isArray(value)) {
    return value
      .map((item, index) => {
        if (item && typeof item === "object") {
          const title = item.citation || item.label || item.id || `item ${index + 1}`;
          const parts = [title];
          if (item.url) parts.push(item.url);
          if (item.evidence_note) parts.push(item.evidence_note);
          return parts.join("\n");
        }
        return String(item);
      })
      .join("\n\n");
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function setDetail(title, type, details) {
  const rows = Object.entries(details || {}).filter(([, value]) => value !== null && value !== undefined && value !== "");
  const body = rows
    .map(([key, value]) => {
      const rendered = formatDetailValue(value);
      return `
        <div class="detail-item">
          <div class="detail-key">${escapeHtml(key)}</div>
          <div class="detail-value">${escapeHtml(rendered)}</div>
        </div>`;
    })
    .join("");

  detailPanel.innerHTML = `
    <div class="detail-kicker">${escapeHtml(type)}</div>
    <h2>${escapeHtml(title)}</h2>
    ${body ? `<div class="detail-list">${body}</div>` : "<p>추가 세부 정보가 없습니다.</p>"}
  `;
}

function renderLegend(parent) {
  const legend = document.createElement("div");
  legend.className = "legend";
  for (const [group, color] of Object.entries(GROUP_COLOR)) {
    const item = document.createElement("span");
    item.className = "legend-item";
    item.innerHTML = `<span class="legend-swatch" style="background:${color};border:1px solid ${GROUP_STROKE[group]}"></span>${group}`;
    legend.append(item);
  }
  parent.append(legend);
}

function render() {
  const filtered = layoutGraph(filterGraph(graph, selectedFilter));
  const nodesById = new Map(filtered.nodes.map((node) => [node.id, node]));
  svg.innerHTML = "";
  svg.setAttribute("viewBox", "0 0 1220 720");

  const defs = el("defs");
  const marker = el("marker", {
    id: "arrow",
    markerWidth: "10",
    markerHeight: "10",
    refX: "8",
    refY: "3",
    orient: "auto",
    markerUnits: "strokeWidth",
  });
  marker.append(el("path", { d: "M 0 0 L 8 3 L 0 6 z", fill: "#9aa6a1" }));
  defs.append(marker);
  svg.append(defs);

  const edgeLayer = el("g", { class: "edges" });
  for (const edge of filtered.edges) {
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (!source || !target) {
      continue;
    }
    const path = pathForEdge(source, target);
    const edgeGroup = el("g", { class: "edge" });
    edgeGroup.append(el("path", {
      class: `edge-path ${edge.type || "default"}`,
      d: path,
      "marker-end": "url(#arrow)",
    }));
    const hit = el("path", { class: "edge-hit", d: path });
    hit.addEventListener("click", () => {
      setDetail(edge.label || "edge", "edge", edge.details || {});
    });
    edgeGroup.append(hit);

    const mx = (source.x + source.width + target.x) / 2;
    const my = (source.y + target.y) / 2 + 4;
    const label = el("text", { class: "edge-label", x: mx, y: my, "text-anchor": "middle" });
    label.textContent = edge.label || "";
    edgeGroup.append(label);
    edgeLayer.append(edgeGroup);
  }
  svg.append(edgeLayer);

  const nodeLayer = el("g", { class: "nodes" });
  for (const node of filtered.nodes) {
    const group = el("g", { class: "node", transform: `translate(${node.x}, ${node.y})` });
    group.append(el("rect", {
      width: node.width,
      height: node.height,
      fill: GROUP_COLOR[node.group] || "#fff",
      stroke: GROUP_STROKE[node.group] || "#889",
    }));

    const text = el("text", { x: 12, y: 20 });
    const lines = wrapText(node.label, node.width > 170 ? 24 : 20);
    lines.forEach((line, index) => {
      const tspan = el("tspan", { x: 12, dy: index === 0 ? 0 : 15 });
      tspan.textContent = line;
      text.append(tspan);
    });
    group.append(text);

    const subtext = el("text", { class: "subtext", x: 12, y: 40 });
    subtext.textContent = node.group;
    group.append(subtext);

    group.addEventListener("click", () => {
      document.querySelectorAll(".node.selected").forEach((item) => item.classList.remove("selected"));
      group.classList.add("selected");
      setDetail(node.label, `node / ${node.group}`, node.details || {});
    });
    nodeLayer.append(group);
  }
  svg.append(nodeLayer);

  if (filtered.nodes.length === 0) {
    const empty = el("text", { x: 60, y: 80, fill: "#68736f" });
    empty.textContent = "표시할 KG 노드가 없습니다.";
    svg.append(empty);
  }
}

async function init() {
  const response = await fetch("/api/kg/graph", { cache: "no-store" });
  graph = await response.json();
  render();
  renderLegend(detailPanel);
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    filterButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    selectedFilter = button.dataset.filter || "all";
    render();
  });
});

init().catch((error) => {
  detailPanel.innerHTML = `
    <div class="detail-kicker">Error</div>
    <h2>KG를 불러오지 못했습니다</h2>
    <p>${error.message}</p>
  `;
});
