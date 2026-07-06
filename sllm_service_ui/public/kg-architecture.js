const svg = document.querySelector("#kgArchitecture");
const inspector = document.querySelector("#inspector");
const editModeButton = document.querySelector("#editModeButton");
const addPiButton = document.querySelector("#addPiButton");
const addEdgeButton = document.querySelector("#addEdgeButton");
const saveGraphButton = document.querySelector("#saveGraphButton");
const resetGraphButton = document.querySelector("#resetGraphButton");

const NS = "http://www.w3.org/2000/svg";
const EDITS_API = "/api/kg/architecture-edits";

function nodePreset(id, label, x, y, w, h, details = {}, extra = {}) {
  return { id, label, x, y, w, h, details, ...extra };
}

const labels = {
  a1Items: [
      "a  세부 사항에 부주의",
      "b  주의 지속 어려움",
      "c  경청하지 않음",
      "d  지시 따르기 및\n과제 완수 실패",
      "e  과제/활동 조직화 어려움",
      "f  지속적 정신 노력\n요구 과제 회피",
      "g  과제에 필요한 물건\n자주 잃어버림",
      "h  외부 자극에 산만",
      "i  일상 활동 잊어버림"
  ],
  a2Items: [
      "a  손발 꼼지락,\n몸 가만두지 못함",
      "b  앉아 있어야 할 때\n자리 이탈",
      "c  부적절한 상황에서\n뛰거나 기어오름",
      "d  조용히 여가 활동하기\n어려움",
      "e  끊임없이 움직임",
      "f  지나치게 말을 많이 함",
      "g  질문이 끝나기 전에 대답",
      "h  차례 기다리기 어려움",
      "i  타인 방해/끼어들기"
  ],
};

const baseNodes = [
  { id: "adhd", label: "ADHD", x: 55, y: 780, w: 330, h: 82, details: {"layer":"Clinical","role":"ADHD clinical construct"} },
  { id: "criterion_a", label: "Criterion A", sublabel: "증상 6개월 이상 지속\n17세 미만 6개↑, 17세 이상 5개↑", x: 455, y: 410, w: 520, h: 105, details: {"official":"A persistent pattern of inattention and/or hyperactivity-impulsivity that interferes with functioning or development."} },
  { id: "criterion_b", label: "Criterion B", sublabel: "증상 12세 이전 발현", x: 455, y: 610, w: 520, h: 92, details: {"official":"Several inattentive or hyperactive-impulsive symptoms were present prior to age 12 years."} },
  { id: "criterion_c", label: "Criterion C", sublabel: "2개 이상 환경에서\n증상 존재", x: 455, y: 805, w: 520, h: 94, details: {"official":"Several symptoms are present in two or more settings."} },
  { id: "criterion_d", label: "Criterion D", sublabel: "사회적, 학업적, 직업적\n기능 저하", x: 455, y: 1005, w: 520, h: 102, details: {"official":"Clear evidence that symptoms interfere with or reduce the quality of social, academic, or occupational functioning."} },
  { id: "criterion_e", label: "Criterion E", sublabel: "다른 정신질환으로\n설명 불가", x: 455, y: 1210, w: 520, h: 100, details: {"official":"Symptoms do not occur exclusively during another psychotic disorder and are not better explained by another mental disorder."} },
  { id: "a1", label: "Criterion A1", sublabel: "(부주의 증상군)", x: 1040, y: 72, w: 360, h: 84, details: {"count":"9 symptoms","threshold":"Under 17: 6 or more; age 17 and older: 5 or more"} },
  { id: "a2", label: "Criterion A2", sublabel: "(과잉행동-충동성 증상군)", x: 1040, y: 850, w: 360, h: 84, details: {"count":"9 symptoms","threshold":"Under 17: 6 or more; age 17 and older: 5 or more"} },
];

labels.a1Items.forEach((label, index) => {
  const id = "a1_" + (index + 1);
  baseNodes.push(nodePreset(id, label, 1432, 78 + index * 72, 360, 64, { criterion: "A1", item: String(index + 1), label }));
});

labels.a2Items.forEach((label, index) => {
  const id = "a2_" + (index + 1);
  baseNodes.push(nodePreset(id, label, 1432, 820 + index * 72, 360, 64, { criterion: "A2", item: String(index + 1), label }));
});

baseNodes.push(
  { id: "selective_attention", label: "선택주의력", x: 1875, y: 130, w: 280, h: 76, highlight: true, details: {"layer":"Behavior Proxy"} },
  { id: "sustained_attention", label: "지속적 주의력", x: 1875, y: 330, w: 280, h: 76, details: {"layer":"Behavior Proxy"} },
  { id: "planning", label: "계획 및 조직화", x: 1875, y: 515, w: 280, h: 76, details: {"layer":"Behavior Proxy"} },
  { id: "working_memory", label: "작업기억", x: 1875, y: 700, w: 280, h: 76, details: {"layer":"Behavior Proxy"} },
  { id: "motor_activity", label: "운동적 활동 수준", x: 1875, y: 990, w: 280, h: 76, details: {"layer":"Behavior Proxy"} },
  { id: "verbal_activity", label: "언어적 활동 수준", x: 1875, y: 1210, w: 280, h: 76, details: {"layer":"Behavior Proxy"} },
  { id: "inhibition", label: "행동 억제", x: 1875, y: 1410, w: 280, h: 76, details: {"layer":"Behavior Proxy"} },
  { id: "first_fixation_duration", label: "et_first_fixation_duration_mean", x: 2180, y: 110, w: 365, h: 74, highlight: true, details: {"primitive_indicator":"et_first_fixation_duration_mean","evidence":"Cui et al. 2020"} },
  { id: "fixation_duration_mean", label: "et_fixation_duration_mean", x: 2180, y: 230, w: 365, h: 74, highlight: true, details: {"primitive_indicator":"et_fixation_duration_mean","evidence":"Canu et al. 2022"} },
  { id: "fixation_duration_std", label: "et_fixation_duration_std", x: 2180, y: 350, w: 365, h: 74, highlight: true, details: {"primitive_indicator":"et_fixation_duration_std","evidence":"Canu et al. 2022"} },
  { id: "total_nonspeech", label: "total nonspeech time", x: 2180, y: 980, w: 365, h: 68, details: {"layer":"Primitive Indicator","status":"Not linked to current VST selective-attention edge"} },
  { id: "utterance_duration", label: "utterance duration", x: 2180, y: 1170, w: 365, h: 68, details: {"layer":"Primitive Indicator","status":"Not linked to current VST selective-attention edge"} },
);

function edge(id, source, target, className = "edge", label = "", details = {}) {
  return { id, source, target, className, label, details, base: true };
}

const baseEdges = [
  edge("clinical_adhd_a", "adhd", "criterion_a", "edge", ""),
  edge("clinical_adhd_b", "adhd", "criterion_b", "edge", ""),
  edge("clinical_adhd_c", "adhd", "criterion_c", "edge", ""),
  edge("clinical_adhd_d", "adhd", "criterion_d", "edge", ""),
  edge("clinical_adhd_e", "adhd", "criterion_e", "edge", ""),
  edge("clinical_a_a1", "criterion_a", "a1", "edge", "A1"),
  edge("clinical_a_a2", "criterion_a", "a2", "edge", "A2"),
  ...Array.from({ length: 9 }, (_, i) => edge(`a1_item_${i + 1}`, "a1", `a1_${i + 1}`, "edge", `${i + 1}`)),
  ...Array.from({ length: 9 }, (_, i) => edge(`a2_item_${i + 1}`, "a2", `a2_${i + 1}`, "edge", `${i + 1}`)),
  edge("a1_1_selective_attention", "a1_1", "selective_attention", "edge", ""),
  edge("a1_2_sustained_attention", "a1_2", "sustained_attention", "edge", ""),
  edge("a1_3_selective_attention", "a1_3", "selective_attention", "edge", ""),
  edge("a1_4_planning", "a1_4", "planning", "edge", ""),
  edge("a1_5_planning", "a1_5", "planning", "edge", ""),
  edge("a1_6_sustained_attention", "a1_6", "sustained_attention", "edge", ""),
  edge("a1_7_working_memory", "a1_7", "working_memory", "edge", ""),
  edge("a1_8_selective_attention", "a1_8", "selective_attention", "edge", ""),
  edge("a1_9_working_memory", "a1_9", "working_memory", "edge", ""),
  edge("a2_1_motor_activity", "a2_1", "motor_activity", "edge", ""),
  edge("a2_2_motor_activity", "a2_2", "motor_activity", "edge", ""),
  edge("a2_3_motor_activity", "a2_3", "motor_activity", "edge", ""),
  edge("a2_4_motor_activity", "a2_4", "motor_activity", "edge", ""),
  edge("a2_5_motor_activity", "a2_5", "motor_activity", "edge", ""),
  edge("a2_6_verbal_activity", "a2_6", "verbal_activity", "edge", ""),
  edge("a2_7_inhibition", "a2_7", "inhibition", "edge", ""),
  edge("a2_8_inhibition", "a2_8", "inhibition", "edge", ""),
  edge("a2_9_inhibition", "a2_9", "inhibition", "edge", ""),
  edge("selective_first_fixation", "selective_attention", "first_fixation_duration", "edge highlight", "", { direction: "high", evidence: "Cui et al. 2020" }),
  edge("selective_fixation_mean", "selective_attention", "fixation_duration_mean", "edge highlight", "", { direction: "high", evidence: "Canu et al. 2022" }),
  edge("selective_fixation_std", "selective_attention", "fixation_duration_std", "edge highlight", "", { direction: "high", evidence: "Canu et al. 2022" }),
];

const footnotes = [];

let edgeOverrides = {};
let customNodes = [];
let customEdges = [];
let selected = null;
let editMode = false;
let dirty = false;
let dragging = null;

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }
  return node;
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

function getAllNodes() {
  return [...baseNodes, ...customNodes];
}

function getNodesById() {
  return new Map(getAllNodes().map((node) => [node.id, node]));
}

function applyEdgeOverride(baseEdge) {
  const override = edgeOverrides[baseEdge.id] || {};
  return {
    ...baseEdge,
    ...override,
    details: override.details || baseEdge.details || {},
    base: true,
  };
}

function getAllEdges() {
  return [
    ...baseEdges.map(applyEdgeOverride).filter((item) => !item.hidden),
    ...customEdges.map((item) => ({ ...item, base: false })),
  ];
}

function setStatus(message) {
  let status = inspector.querySelector(".status-line");
  if (!status) {
    status = document.createElement("div");
    status.className = "status-line";
    inspector.prepend(status);
  }
  status.textContent = message;
}

function centerRight(node) {
  return { x: node.x + node.w, y: node.y + node.h / 2 };
}

function centerLeft(node) {
  return { x: node.x, y: node.y + node.h / 2 };
}

function edgePath(edgeObj) {
  const nodes = getNodesById();
  const source = nodes.get(edgeObj.source);
  const target = nodes.get(edgeObj.target);
  if (!source || !target) {
    return "";
  }
  const s = centerRight(source);
  const t = centerLeft(target);
  const dx = Math.max(30, (t.x - s.x) * 0.42);
  return `M ${s.x} ${s.y} C ${s.x + dx} ${s.y}, ${t.x - dx} ${t.y}, ${t.x} ${t.y}`;
}

function edgeMidpoint(edgeObj) {
  const nodes = getNodesById();
  const source = nodes.get(edgeObj.source);
  const target = nodes.get(edgeObj.target);
  if (!source || !target) {
    return { x: 0, y: 0 };
  }
  return {
    x: (source.x + source.w + target.x) / 2,
    y: (source.y + source.h / 2 + target.y + target.h / 2) / 2,
  };
}

function drawEdge(edgeObj) {
  const d = edgePath(edgeObj);
  if (!d) {
    return;
  }
  const group = svgEl("g", { class: "edge-group" });
  const selectedClass = selected?.type === "edge" && selected.id === edgeObj.id ? " selected" : "";
  group.append(svgEl("path", { class: `${edgeObj.className || "edge"}${selectedClass}`, d }));
  const hit = svgEl("path", { class: "edge-hotspot", d });
  hit.addEventListener("click", (event) => {
    event.stopPropagation();
    selected = { type: "edge", id: edgeObj.id };
    setEdgeInspector(edgeObj);
    render(false);
  });
  group.append(hit);

  if (edgeObj.label) {
    const mid = edgeMidpoint(edgeObj);
    const label = svgEl("text", { class: "edge-label", x: mid.x, y: mid.y - 3, "text-anchor": "middle" });
    label.textContent = edgeObj.label;
    group.append(label);
  }
  svg.append(group);
}

function wrapLines(text, maxChars) {
  const raw = String(text || "");
  const manualLines = raw.split(/\n+/).filter(Boolean);
  if (manualLines.length > 1) {
    return manualLines.flatMap((line) => wrapLines(line, maxChars));
  }
  if (raw.length <= maxChars) {
    return [raw];
  }

  const tokenized = raw.includes("_")
    ? raw.split("_").map((part, index, parts) => (index < parts.length - 1 ? part + "_" : part))
    : raw.includes(" ")
      ? raw.split(/(\s+)/).filter((part) => part.trim())
      : [...raw];

  const lines = [];
  let current = "";
  for (const token of tokenized) {
    if ((current + token).length > maxChars && current) {
      lines.push(current.trim());
      current = token;
    } else {
      current += token;
    }
  }
  if (current) lines.push(current.trim());
  return lines;
}

function drawNode(node) {
  const isSelected = selected?.type === "node" && selected.id === node.id;
  const group = svgEl("g", {
    class: `node hotspot ${editMode ? "editable" : ""} ${node.highlight ? "highlight" : ""} ${isSelected ? "selected" : ""}`,
    transform: `translate(${node.x}, ${node.y})`,
    "data-node-id": node.id,
  });
  group.append(svgEl("rect", { width: node.w, height: node.h }));

  const labelMax = node.w >= 500 ? 30 : node.w >= 340 ? 34 : node.w >= 260 ? 18 : 14;
  const labelLines = wrapLines(node.label, labelMax).slice(0, 3);
  const labelLineHeight = node.h <= 34 ? 12 : 18;
  const labelStartY = node.sublabel ? 24 : node.h / 2 - ((labelLines.length - 1) * labelLineHeight) / 2 + 6;
  const text = svgEl("text", { x: node.w / 2, y: labelStartY, "text-anchor": "middle" });
  labelLines.forEach((line, index) => {
    const tspan = svgEl("tspan", { x: node.w / 2, dy: index === 0 ? 0 : labelLineHeight });
    tspan.textContent = line;
    text.append(tspan);
  });
  group.append(text);

  if (node.sublabel) {
    const subLines = wrapLines(node.sublabel, node.w >= 500 ? 30 : node.w >= 340 ? 28 : 20).slice(0, 3);
    const subLineHeight = node.h >= 80 ? 17 : 15;
    const subStartY = node.h - subLines.length * subLineHeight - 8;
    subLines.forEach((line, index) => {
      const sub = svgEl("text", { class: "small", x: node.w / 2, y: subStartY + index * subLineHeight, "text-anchor": "middle" });
      sub.textContent = line;
      group.append(sub);
    });
  }

  if (node.footnote) {
    const mark = svgEl("text", { class: "small", x: node.w + 7, y: 7 });
    mark.textContent = node.footnote;
    group.append(mark);
  }

  group.addEventListener("pointerdown", (event) => startDrag(event, node));
  group.addEventListener("click", () => {
    if (!dragging || !dragging.moved) {
      selected = { type: "node", id: node.id };
      setNodeInspector(node);
      render(false);
    }
  });
  svg.append(group);
}

function drawLayerHeader(label, x, y, w) {
  const rect = svgEl("rect", { x, y, width: w, height: 20, fill: "#cfcfcf", stroke: "#777777", "stroke-width": 1 });
  const text = svgEl("text", { class: "layer-title", x: x + w / 2, y: y + 14, "text-anchor": "middle" });
  text.textContent = label;
  svg.append(rect, text);
}

function pointerToSvg(event) {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(svg.getScreenCTM().inverse());
}

function startDrag(event, node) {
  selected = { type: "node", id: node.id };
  setNodeInspector(node);
  if (!editMode) {
    return;
  }
  event.preventDefault();
  const point = pointerToSvg(event);
  dragging = {
    node,
    pointerId: event.pointerId,
    offsetX: point.x - node.x,
    offsetY: point.y - node.y,
    moved: false,
  };
  svg.setPointerCapture(event.pointerId);
}

function moveDrag(event) {
  if (!dragging || event.pointerId !== dragging.pointerId) {
    return;
  }
  const point = pointerToSvg(event);
  dragging.node.x = Math.round(point.x - dragging.offsetX);
  dragging.node.y = Math.round(point.y - dragging.offsetY);
  dragging.moved = true;
  dirty = true;
  render(false);
}

function endDrag(event) {
  if (!dragging || event.pointerId !== dragging.pointerId) {
    return;
  }
  try {
    svg.releasePointerCapture(event.pointerId);
  } catch {
    // Pointer capture may already be released by the browser.
  }
  const wasMoved = dragging.moved;
  dragging = wasMoved ? { moved: true } : null;
  setTimeout(() => {
    dragging = null;
  }, 0);
}

function nodeOptions(selectedId) {
  return getAllNodes()
    .map((node) => `<option value="${escapeHtml(node.id)}" ${node.id === selectedId ? "selected" : ""}>${escapeHtml(node.label)} (${escapeHtml(node.id)})</option>`)
    .join("");
}

function setNodeInspector(node) {
  const rows = Object.entries(node.details || {})
    .map(([key, value]) => `<div class="detail-item"><div class="detail-key">${escapeHtml(key)}</div><div class="detail-value">${escapeHtml(formatDetailValue(value))}</div></div>`)
    .join("");
  const detailText = JSON.stringify(node.details || {}, null, 2);
  inspector.innerHTML = `
    <div class="inspector-kicker">${node.highlight ? "Highlighted KG node" : "KG node"}</div>
    <h2>${escapeHtml(node.label)}</h2>
    <p>${escapeHtml(node.sublabel || "")}</p>
    <form class="editor-form" id="nodeEditor">
      <div class="field-row">
        <label>Label<input id="nodeLabelInput" value="${escapeHtml(node.label)}" ${editMode ? "" : "disabled"} /></label>
        <label>Sublabel<input id="nodeSublabelInput" value="${escapeHtml(node.sublabel || "")}" ${editMode ? "" : "disabled"} /></label>
      </div>
      <label>Details JSON<textarea id="nodeDetailsInput" ${editMode ? "" : "disabled"}>${escapeHtml(detailText)}</textarea></label>
      <div class="editor-actions">
        <button class="link-button primary" type="submit" ${editMode ? "" : "disabled"}>Apply Node</button>
        <button class="link-button" id="connectFromNodeButton" type="button" ${editMode ? "" : "disabled"}>Add Edge From This</button>
      </div>
    </form>
    <div class="detail-list">${rows}</div>
  `;
  inspector.querySelector("#nodeEditor").addEventListener("submit", (event) => {
    event.preventDefault();
    applyNodeEditor(node);
  });
  inspector.querySelector("#connectFromNodeButton").addEventListener("click", () => addEdgeFrom(node.id));
}

function applyNodeEditor(node) {
  const label = inspector.querySelector("#nodeLabelInput")?.value.trim();
  const sublabel = inspector.querySelector("#nodeSublabelInput")?.value.trim();
  const detailsRaw = inspector.querySelector("#nodeDetailsInput")?.value.trim() || "{}";
  let details;
  try {
    details = JSON.parse(detailsRaw);
  } catch (error) {
    setStatus(`Details JSON error: ${error.message}`);
    return;
  }
  node.label = label || node.label;
  node.sublabel = sublabel || "";
  node.details = details && typeof details === "object" ? details : {};
  dirty = true;
  render(false);
  setNodeInspector(node);
  setStatus("Node changes applied locally. Save KG Draft를 눌러 저장하세요.");
}

function setEdgeInspector(edgeObj) {
  const detailsText = JSON.stringify(edgeObj.details || {}, null, 2);
  inspector.innerHTML = `
    <div class="inspector-kicker">${edgeObj.base ? "Base KG edge" : "Custom KG edge"}</div>
    <h2>${escapeHtml(edgeObj.label || edgeObj.id)}</h2>
    <p>${escapeHtml(edgeObj.source)} -> ${escapeHtml(edgeObj.target)}</p>
    <form class="editor-form" id="edgeEditor">
      <div class="field-row">
        <label>Source<select id="edgeSourceInput" ${editMode ? "" : "disabled"}>${nodeOptions(edgeObj.source)}</select></label>
        <label>Target<select id="edgeTargetInput" ${editMode ? "" : "disabled"}>${nodeOptions(edgeObj.target)}</select></label>
      </div>
      <div class="field-row">
        <label>Label<input id="edgeLabelInput" value="${escapeHtml(edgeObj.label || "")}" ${editMode ? "" : "disabled"} /></label>
        <label>Type<select id="edgeTypeInput" ${editMode ? "" : "disabled"}>
          <option value="edge" ${edgeObj.className === "edge" ? "selected" : ""}>default</option>
          <option value="edge highlight" ${edgeObj.className === "edge highlight" ? "selected" : ""}>highlight</option>
          <option value="edge guardrail" ${edgeObj.className === "edge guardrail" ? "selected" : ""}>guardrail</option>
          <option value="edge highlight guardrail" ${edgeObj.className === "edge highlight guardrail" ? "selected" : ""}>highlight guardrail</option>
        </select></label>
      </div>
      <label>Details JSON<textarea id="edgeDetailsInput" ${editMode ? "" : "disabled"}>${escapeHtml(detailsText)}</textarea></label>
      <div class="editor-actions">
        <button class="link-button primary" type="submit" ${editMode ? "" : "disabled"}>Apply Edge</button>
        <button class="link-button danger" id="removeEdgeButton" type="button" ${editMode ? "" : "disabled"}>${edgeObj.base ? "Hide Base Edge" : "Delete Edge"}</button>
      </div>
    </form>
  `;
  inspector.querySelector("#edgeEditor").addEventListener("submit", (event) => {
    event.preventDefault();
    applyEdgeEditor(edgeObj);
  });
  inspector.querySelector("#removeEdgeButton").addEventListener("click", () => removeEdge(edgeObj));
}

function applyEdgeEditor(edgeObj) {
  const source = inspector.querySelector("#edgeSourceInput")?.value;
  const target = inspector.querySelector("#edgeTargetInput")?.value;
  const className = inspector.querySelector("#edgeTypeInput")?.value || "edge";
  const label = inspector.querySelector("#edgeLabelInput")?.value.trim() || "";
  const detailsRaw = inspector.querySelector("#edgeDetailsInput")?.value.trim() || "{}";
  let details;
  try {
    details = JSON.parse(detailsRaw);
  } catch (error) {
    setStatus(`Edge details JSON error: ${error.message}`);
    return;
  }

  if (edgeObj.base) {
    edgeOverrides[edgeObj.id] = {
      ...(edgeOverrides[edgeObj.id] || {}),
      source,
      target,
      className,
      label,
      details,
    };
  } else {
    const edgeIndex = customEdges.findIndex((item) => item.id === edgeObj.id);
    if (edgeIndex >= 0) {
      customEdges[edgeIndex] = { ...customEdges[edgeIndex], source, target, className, label, details };
    }
  }
  dirty = true;
  const updated = getAllEdges().find((item) => item.id === edgeObj.id);
  selected = { type: "edge", id: edgeObj.id };
  render(false);
  if (updated) {
    setEdgeInspector(updated);
  }
  setStatus("Edge changes applied locally. Save KG Draft를 눌러 저장하세요.");
}

function removeEdge(edgeObj) {
  if (edgeObj.base) {
    edgeOverrides[edgeObj.id] = { ...(edgeOverrides[edgeObj.id] || {}), hidden: true };
  } else {
    customEdges = customEdges.filter((item) => item.id !== edgeObj.id);
  }
  dirty = true;
  selected = null;
  render();
  setStatus(edgeObj.base ? "Base edge hidden locally." : "Custom edge deleted locally.");
}

function drawFootnotes() {
  footnotes.forEach((note, index) => {
    const text = svgEl("text", { class: "footnote", x: 22, y: 666 + index * 13 });
    text.textContent = note;
    svg.append(text);
  });
}

function applyEdits(edits) {
  const nodeOverrides = edits?.nodeOverrides || {};
  for (const node of baseNodes) {
    const override = nodeOverrides[node.id];
    if (!override) {
      continue;
    }
    Object.assign(node, {
      x: Number.isFinite(override.x) ? override.x : node.x,
      y: Number.isFinite(override.y) ? override.y : node.y,
      w: Number.isFinite(override.w) ? override.w : node.w,
      h: Number.isFinite(override.h) ? override.h : node.h,
      label: typeof override.label === "string" ? override.label : node.label,
      sublabel: typeof override.sublabel === "string" ? override.sublabel : node.sublabel,
      footnote: typeof override.footnote === "string" ? override.footnote : node.footnote,
      highlight: typeof override.highlight === "boolean" ? override.highlight : node.highlight,
      details: override.details && typeof override.details === "object" ? override.details : node.details,
    });
  }
  edgeOverrides = edits?.edgeOverrides && typeof edits.edgeOverrides === "object" ? edits.edgeOverrides : {};
  customNodes = Array.isArray(edits?.customNodes) ? edits.customNodes : [];
  customEdges = Array.isArray(edits?.customEdges) ? edits.customEdges : [];
}

function exportEdits() {
  const nodeOverrides = {};
  for (const node of baseNodes) {
    nodeOverrides[node.id] = {
      x: node.x,
      y: node.y,
      w: node.w,
      h: node.h,
      label: node.label,
      sublabel: node.sublabel || "",
      footnote: node.footnote || "",
      highlight: Boolean(node.highlight),
      details: node.details || {},
    };
  }

  return {
    version: "kg_architecture_edits_v1",
    nodeOverrides,
    edgeOverrides,
    customNodes,
    customEdges,
  };
}

async function loadEdits() {
  const response = await fetch(EDITS_API, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`load failed: ${response.status}`);
  }
  applyEdits(await response.json());
  render();
}

async function saveEdits() {
  const response = await fetch(EDITS_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(exportEdits()),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  dirty = false;
  setStatus("KG draft saved. Runtime KG JSON is unchanged.");
}

async function resetEdits() {
  const blank = { version: "kg_architecture_edits_v1", nodeOverrides: {}, edgeOverrides: {}, customNodes: [], customEdges: [] };
  const response = await fetch(EDITS_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(blank),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  window.location.reload();
}

function addPrimitiveIndicatorNode() {
  const id = `custom_pi_${Date.now()}`;
  const sourceId = selected?.type === "node" ? selected.id : "selective_attention";
  const node = {
    id,
    label: "new_primitive_indicator",
    sublabel: "",
    x: 1325,
    y: 360 + customNodes.length * 70,
    w: 310,
    h: 34,
    highlight: true,
    details: {
      primitive_indicator: "new_primitive_indicator",
      direction: "여기에 방향성을 입력",
      evidence: "근거 논문 또는 source 입력",
      caution: "과잉해석 방지 문구 입력",
    },
  };
  customNodes.push(node);
  addEdgeFrom(sourceId, id);
  selected = { type: "node", id };
  dirty = true;
  render();
  setNodeInspector(node);
}

function addEdgeFrom(sourceId = null, targetId = null) {
  const source = sourceId || (selected?.type === "node" ? selected.id : "selective_attention");
  const target = targetId || "first_fixation_duration";
  const newEdge = {
    id: `custom_edge_${Date.now()}`,
    source,
    target,
    className: "edge highlight",
    label: "",
    details: { relation: "custom edge", note: "근거와 해석 방향을 입력하세요." },
  };
  customEdges.push(newEdge);
  selected = { type: "edge", id: newEdge.id };
  dirty = true;
  render();
  setEdgeInspector(newEdge);
}

function render(updateInspector = true) {
  svg.setAttribute("viewBox", "0 0 2600 1600");
  svg.innerHTML = "";
  svg.classList.toggle("edit-mode", editMode);

  svg.append(svgEl("rect", { x: 28, y: 28, width: 1785, height: 1535, fill: "#dcecf8", stroke: "#7b9bb3", "stroke-width": 2 }));
  drawLayerHeader("DSM(Diagnostic and Statistical Manual of Mental Disorders)-5", 330, 24, 1160);
  drawLayerHeader("Behavior Proxy Layer", 1855, 24, 320);
  drawLayerHeader("Primitive Indicator Layer", 2180, 24, 365);

  getAllEdges().forEach(drawEdge);
  getAllNodes().forEach(drawNode);
  drawFootnotes();

  if (selected && updateInspector) {
    if (selected.type === "node") {
      const node = getNodesById().get(selected.id);
      if (node) {
        setNodeInspector(node);
      }
    } else {
      const edgeObj = getAllEdges().find((item) => item.id === selected.id);
      if (edgeObj) {
        setEdgeInspector(edgeObj);
      }
    }
  }
}

editModeButton.addEventListener("click", () => {
  editMode = !editMode;
  editModeButton.textContent = editMode ? "Edit On" : "Edit Off";
  editModeButton.classList.toggle("active", editMode);
  render();
});

addPiButton.addEventListener("click", () => {
  if (!editMode) {
    editModeButton.click();
  }
  addPrimitiveIndicatorNode();
});

addEdgeButton.addEventListener("click", () => {
  if (!editMode) {
    editModeButton.click();
  }
  addEdgeFrom();
});

saveGraphButton.addEventListener("click", () => {
  saveEdits().catch((error) => setStatus(`Save failed: ${error.message}`));
});

resetGraphButton.addEventListener("click", () => {
  const ok = window.confirm("저장된 KG architecture draft를 초기화할까요? Runtime KG는 그대로 유지됩니다.");
  if (ok) {
    resetEdits().catch((error) => setStatus(`Reset failed: ${error.message}`));
  }
});

svg.addEventListener("pointermove", moveDrag);
svg.addEventListener("pointerup", endDrag);
svg.addEventListener("pointercancel", endDrag);
svg.addEventListener("click", (event) => {
  if (event.target === svg) {
    selected = null;
    render(false);
  }
});

window.addEventListener("beforeunload", (event) => {
  if (!dirty) {
    return;
  }
  event.preventDefault();
  event.returnValue = "";
});

loadEdits().catch((error) => {
  render();
  setStatus(`Edit state load failed: ${error.message}`);
});
