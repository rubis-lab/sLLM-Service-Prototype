const fs = require("node:fs");
const path = require("node:path");

const LOCAL_KG_DIR = path.join(__dirname, "kg");
const HANDOFF_KG_DIR = path.join(__dirname, "..", "kg");
const KG_DIR = fs.existsSync(LOCAL_KG_DIR) ? LOCAL_KG_DIR : HANDOFF_KG_DIR;

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(KG_DIR, name), "utf8"));
}

function primitiveDetails(edge, taskName, primitiveIndicators) {
  const primitive = primitiveIndicators?.primitive_indicators?.[edge.pi] || {};
  const taskInterpretations = primitive.task_interpretations || {};
  const behaviorProxyByTask = Object.fromEntries(
    Object.entries(taskInterpretations).map(([task, interpretation]) => [task, interpretation.behavior_proxy]),
  );
  return {
    definition: primitive.definition || null,
    unit: primitive.unit || null,
    value_type: primitive.value_type || null,
    higher_value_general_meaning: primitive.higher_value_general_meaning || null,
    lower_value_general_meaning: primitive.lower_value_general_meaning || null,
    task_interpretations: taskInterpretations,
    behavior_proxy_by_task: behaviorProxyByTask,
    evidence: primitive.evidence || [],
    report_constraints: primitive.report_constraints || [],
  };
}

function addNode(nodes, id, label, group, layer, details = {}) {
  if (!nodes.has(id)) {
    nodes.set(id, {
      id,
      label,
      group,
      layer,
      details,
    });
    return;
  }

  const existing = nodes.get(id);
  for (const [key, value] of Object.entries(details)) {
    if (value === null || value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      const prev = Array.isArray(existing.details[key]) ? existing.details[key] : [];
      const merged = new Map();
      for (const item of [...prev, ...value]) {
        const mergeKey = typeof item === "object" && item ? item.id || item.citation || JSON.stringify(item) : String(item);
        merged.set(mergeKey, item);
      }
      existing.details[key] = Array.from(merged.values());
      continue;
    }
    if (typeof value === "object") {
      const prev = existing.details[key] && typeof existing.details[key] === "object" ? existing.details[key] : {};
      existing.details[key] = {
        ...prev,
        ...value,
      };
      continue;
    }
    existing.details[key] = value;
  }
}

function addEdge(edges, source, target, label, type = "default", details = {}) {
  edges.push({
    id: `${source}->${target}:${edges.length}`,
    source,
    target,
    label,
    type,
    details,
  });
}

function makeSafeId(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9가-힣_:-]+/gi, "_")
    .replace(/^_+|_+$/g, "");
}

function evidenceId(edge) {
  if (!edge.evidence) {
    return null;
  }
  const first = edge.evidence.split(",")[0].trim();
  return `evidence:${makeSafeId(first)}`;
}

function buildGraph() {
  const dsm5 = readJson("dsm5_adhd_criteria_v1.json");
  const taskEdges = readJson("task_pi_edges_v2.json");
  const primitiveIndicators = readJson("primitive_indicators_v2.json");
  const nodes = new Map();
  const edges = [];

  addNode(nodes, "clinical:adhd", "ADHD", "clinical", "clinical", {
    description: "DSM-5 ADHD clinical layer",
  });
  addNode(nodes, "clinical:dsm5", "DSM-5 ADHD Criteria", "clinical", "clinical", {
    scope: dsm5.scope,
    boundary: dsm5.clinical_boundary,
    report_generation: dsm5.report_generation || null,
  });
  addEdge(edges, "clinical:adhd", "clinical:dsm5", "defined by", "clinical");

  addNode(nodes, "clinical:criterion_a", "Criterion A", "clinical", "clinical", {
    summary: dsm5.criteria.A.summary,
    duration: dsm5.criteria.A.duration,
  });
  addNode(nodes, "clinical:a1", "A1 Inattention", "clinical", "clinical", {
    count: dsm5.criteria.A.A1_inattention.count,
    threshold_under_17: dsm5.criteria.A.A1_inattention.threshold_under_17,
    threshold_17_or_older: dsm5.criteria.A.A1_inattention.threshold_17_or_older,
    items_ko: dsm5.criteria.A.A1_inattention.items_ko,
  });
  addNode(nodes, "clinical:a2", "A2 Hyperactivity/Impulsivity", "clinical", "clinical", {
    count: dsm5.criteria.A.A2_hyperactivity_impulsivity.count,
    threshold_under_17: dsm5.criteria.A.A2_hyperactivity_impulsivity.threshold_under_17,
    threshold_17_or_older: dsm5.criteria.A.A2_hyperactivity_impulsivity.threshold_17_or_older,
    items_ko: dsm5.criteria.A.A2_hyperactivity_impulsivity.items_ko,
  });
  addEdge(edges, "clinical:dsm5", "clinical:criterion_a", "includes", "clinical");
  addEdge(edges, "clinical:criterion_a", "clinical:a1", "9 symptoms", "clinical");
  addEdge(edges, "clinical:criterion_a", "clinical:a2", "9 symptoms", "clinical");

  for (const criterion of ["B", "C", "D", "E"]) {
    const id = `clinical:criterion_${criterion.toLowerCase()}`;
    addNode(nodes, id, `Criterion ${criterion}`, "clinical", "clinical", {
      description: dsm5.criteria[criterion],
    });
    addEdge(edges, "clinical:dsm5", id, "required", "clinical");
  }

  addNode(nodes, "guardrail:no_single_test", "No Single-Test Diagnosis", "guardrail", "guardrail", {
    description: dsm5.clinical_boundary.join(" "),
    forbidden: dsm5.forbidden_or_risky_phrasing,
  });
  addEdge(edges, "guardrail:no_single_test", "clinical:dsm5", "guards", "guardrail");

  for (const [taskName, task] of Object.entries(taskEdges.tasks)) {
    const taskId = `task:${taskName.toLowerCase()}`;
    addNode(nodes, taskId, taskName, "task", "task", {
      description: task.task_description,
      aliases: task.task_aliases,
    });

    const proxyId = `proxy:${makeSafeId(task.primary_behavior_proxy)}`;
    addNode(nodes, proxyId, task.primary_behavior_proxy, "behavior", "behavior", {
      task: taskName,
      description: "Primary behavior proxy for this task in the current KG.",
    });
    addEdge(edges, taskId, proxyId, "observes", "task_proxy");

    if (taskName === "VST") {
      addEdge(edges, proxyId, "clinical:a1", "auxiliary relevance only", "caution", {
        caution: "Behavior proxy is clinically relevant to attention, but it does not satisfy DSM-5 A1 by itself.",
      });
    }

    const allEdges = [
      ...(task.edges || []).map((edge) => ({ ...edge, bucket: "primary" })),
      ...(task.conditional_edges || []).map((edge) => ({ ...edge, bucket: "conditional" })),
      ...(task.guardrail_edges || []).map((edge) => ({ ...edge, bucket: "guardrail" })),
    ];

    for (const edge of allEdges) {
      const piId = `pi:${edge.pi}`;
      const behaviorId = `proxy:${makeSafeId(edge.behavior_proxy)}`;
      addNode(nodes, piId, edge.pi, "pi", "pi", {
        direction: edge.direction,
        polarity: edge.polarity || null,
        tasks: [taskName],
        ...primitiveDetails(edge, taskName, primitiveIndicators),
      });
      addNode(nodes, behaviorId, edge.behavior_proxy, "behavior", "behavior", {
        task: taskName,
        interpretation: edge.interpretation,
      });
      addEdge(edges, taskId, piId, "measures", "task_pi");
      addEdge(edges, piId, behaviorId, `${edge.direction} ${edge.polarity || ""}`.trim(), edge.bucket, {
        interpretation: edge.interpretation,
        caution: edge.caution || null,
        evidence: edge.evidence || null,
        grade: edge.kg_grade || null,
      });

      if (edge.caution) {
        const cautionId = `guardrail:${makeSafeId(taskName)}:${edge.pi}`;
        addNode(nodes, cautionId, `${taskName} caution`, "guardrail", "guardrail", {
          caution: edge.caution,
        });
        addEdge(edges, cautionId, behaviorId, "limits", "guardrail");
      }

      const evId = evidenceId(edge);
      if (evId) {
        addNode(nodes, evId, edge.evidence.split(",")[0].trim(), "evidence", "evidence", {
          citation: edge.evidence,
        });
        addEdge(edges, evId, piId, "supports", "evidence");
      }
    }
  }

  return {
    id: "local_llm_chat_kg_graph_v1",
    generatedAt: new Date().toISOString(),
    layers: ["clinical", "task", "behavior", "pi", "evidence", "guardrail"],
    nodes: Array.from(nodes.values()),
    edges,
  };
}

module.exports = {
  buildGraph,
};
