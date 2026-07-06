const fs = require("node:fs");
const path = require("node:path");

const LOCAL_KG_DIR = path.join(__dirname, "kg");
const HANDOFF_KG_DIR = path.join(__dirname, "..", "kg");
const KG_DIR = fs.existsSync(LOCAL_KG_DIR) ? LOCAL_KG_DIR : HANDOFF_KG_DIR;
const DSM5_FILE = path.join(KG_DIR, "dsm5_adhd_criteria_v1.json");
const TASK_EDGES_FILE = path.join(KG_DIR, "task_pi_edges_v2.json");
const PRIMITIVE_INDICATORS_FILE = path.join(KG_DIR, "primitive_indicators_v2.json");
const KG_CONTEXT_MAX_CHARS = Number(process.env.KG_CONTEXT_MAX_CHARS || 16000);
// 교수님 Feedback 반영 전
// const OUTPUT_FORMAT_REQUIREMENT = [
//   "[1. 목적] [2. 시행된 검사] [3. 검사 결과 및 주요 관찰] [4. 데이터 해석 및 임상적 시사점] [5. DSM-5 진단 기준 확인 사항] 이 5개 섹션 형식에 맞게 답을 하되, 각 지표별 해석을 생략하지 말고 충분히 설명하세요. [5]에서는 DSM-5 ADHD 판단에 필요한 6개월 이상 지속, 12세 이전 일부 증상, 2개 이상 환경, 기능 방해 또는 질 저하, 다른 정신질환/의학적 상태/물질 영향 등 더 나은 설명 배제를 추가 확인 사항으로 쓰고, PI 값만으로 기준 충족을 단정하지 마세요. 참고 지식에 임상 기준 연결 정보가 있으면 [5]에서 해당 behavior proxy 관련 관찰 소견이 DSM-5 criterion/domain의 어떤 항목에 대한 추가 확인 필요와 연결되는지 자연스럽게 제시하세요. bridge_type이 auxiliary_observation_not_diagnostic이면 진단 또는 기준 충족 근거가 아니라 추가 확인 항목으로 표현하세요. 답변에서는 '보조', '보조적으로', '보조 소견', '보조 관찰' 표현을 쓰지 말고, 필요하면 '관찰 소견', '추가 확인이 필요한 소견', '관련 가능성'으로 바꿔 표현하세요.",
//   "",
//   "아래 추가 포맷 지침은 [2. 시행된 검사], [3. 검사 결과 및 주요 관찰], [4. 데이터 해석 및 임상적 시사점]에만 적용하세요. [1], [5]의 작성 방식은 위 기존 지침을 따르세요.",
//   "",
//   "[2. 시행된 검사]",
//   "아래 구조를 검사별로 반복하세요. SERVER_STRUCTURED_REPORT_DATA 또는 사용자 입력에 있는 task와 PI만 사용하고, 없는 값은 추정하지 말고 제공되지 않음으로 쓰세요.",
//   "■ 검사명 : {task 이름}",
//   "- 정의 : {task 정의}",
//   "- 연관 Primitive Indicator :",
//   "  - {pi1}",
//   "  - {pi2}",
//   "",
//   "[3. 검사 결과 및 주요 관찰]",
//   "아래 구조를 검사별로 반복하세요. 측정값은 SERVER_STRUCTURED_REPORT_DATA의 value를 우선 사용하고, 해석 표현은 SERVER_STRUCTURED_REPORT_DATA의 interpretation_label만 사용하세요. p25-p75 같은 percentile band는 해석 표현에 덧붙이지 마세요. 설명은 반드시 '{pi 이름} 값은 {측정값}로, {해석 표현}에 해당한다.' 형식의 담백한 관찰 문장으로 작성하세요. '높다', '낮다', '길다', '짧다', '길지 않다', '두드러지지 않는다', '주의력 저하', '가능성' 같은 추가 해석 표현을 붙이지 마세요. automatic processing(초기 자동처리), central discrimination(중심시야 기반 자극 판별), intra-subject variability(수행 시간 변동성), search coverage(시선 탐색 범위) 같은 KG 해석 용어와 임상적 시사점은 [3] 설명에 쓰지 말고 [4]에서 종합하세요.",
//   "■ 검사명 : {task 이름}",
//   "- 연관 Primitive Indicator :",
//   "  - {pi1}",
//   "    - 측정값 : {pi1 측정값}",
//   "    - 해석 표현 : {pi1 해석 표현}",
//   "    - 설명 : {pi1 해석 설명}",
//   "  - {pi2}",
//   "    - 측정값 : {pi2 측정값}",
//   "    - 해석 표현 : {pi2 해석 표현}",
//   "    - 설명 : {pi2 해석 설명}",
//   "",
//   "[4. 데이터 해석 및 임상적 시사점]",
//   "KG_FACTS의 use/range_hint를 우선 반영하고, KG_CONTEXT_ONLY_NOT_EVIDENCE는 방향성이 맞지 않거나 근거로 쓰기 어려운 참고 정보로만 사용하세요. use/range_hint 안에 automatic processing(초기 자동처리), central discrimination(중심시야 기반 자극 판별), intra-subject variability(수행 시간 변동성), search coverage(시선 탐색 범위) 중 하나라도 포함되어 있으면, 문장에 해당 용어를 영문+한글 괄호 형식 그대로 반드시 포함하세요. 해당 용어를 일반 표현으로 바꾸거나 생략하지 마세요. '보조', '보조적으로', '보조 소견', '보조 관찰' 표현을 쓰지 말고, 필요하면 '관찰 소견', '관련 가능성', '추가 확인이 필요한 소견'으로 바꿔 표현하세요. DSM-5 ADHD 진단 기준 A~E는 [4]에 쓰지말고 [5]에서 종합하세요. 단, PI 값만으로 진단이나 DSM-5 기준 충족을 단정하지 마세요.",
// ].join("\n");

// 교수님 Feedback 반영 후
// const OUTPUT_FORMAT_REQUIREMENT = [
//   "[1. 개요] [2. 보고서의 근거가 되는 Task] [3. 검사 결과 지표 및 연관 Primitive Indicator] [4. 센서 데이터 해석 및 임상적 시사점] [5. DSM-5 진단 기준 확인 사항] 이 5개 섹션 형식에 맞게 답을 하되, 각 지표별 해석을 생략하지 말고 충분히 설명하세요. [5]에서는 DSM-5 ADHD 판단에 필요한 6개월 이상 지속, 12세 이전 일부 증상, 2개 이상 환경, 기능 방해 또는 질 저하, 다른 정신질환/의학적 상태/물질 영향 등 더 나은 설명 배제를 추가 확인 사항으로 쓰고, PI 값만으로 기준 충족을 단정하지 마세요. 참고 지식에 임상 기준 연결 정보가 있으면 [5]에서 해당 behavior proxy 관련 관찰 소견이 DSM-5 criterion/domain의 어떤 항목에 대한 추가 확인 필요와 연결되는지 자연스럽게 제시하세요. bridge_type이 auxiliary_observation_not_diagnostic이면 진단 또는 기준 충족 근거가 아니라 추가 확인 항목으로 표현하세요. 답변에서는 '보조', '보조적으로', '보조 소견', '보조 관찰' 표현을 쓰지 말고, 필요하면 '관찰 소견', '추가 확인이 필요한 소견', '관련 가능성'으로 바꿔 표현하세요.",
//   "",
//   "[1. 개요]는 정확히 1문장만 작성하세요. 문장은 '본 보고서는 {표시 대상자 ID} 학생이 {task 이름}에서 보인 시각 탐색 수행 관련 지표를 기반으로 하며, 선택주의력과 관련된 시각 처리 양상을 해석합니다.' 형식을 따르세요. VST 정의, automatic processing(초기 자동처리), central discrimination(중심시야 기반 자극 판별), intra-subject variability(수행 시간 변동성), search coverage(시선 탐색 범위), DSM-5 관련 해석은 [1]에 쓰지 말고 해당 섹션에서만 다루세요.",
//   "",
//   "아래 추가 포맷 지침은 [2. 보고서의 근거가 되는 Task] [3. 검사 결과 지표 및 연관 Primitive Indicator] [4. 센서 데이터 해석 및 임상적 시사점]에만 적용하세요. [5]의 작성 방식은 위 기존 지침을 따르세요.",
//   "",
//   "[2. 보고서의 근거가 되는 Task]",
//   "아래 구조를 검사별로 반복하세요. SERVER_STRUCTURED_REPORT_DATA 또는 사용자 입력에 있는 task와 PI만 사용하고, 없는 값은 추정하지 말고 제공되지 않음으로 쓰세요.",
//   "■ Task명 : {task 이름}",
//   "- 정의 : {task 정의}",
//   "- 연관 Primitive Indicator :",
//   "  - {pi1}",
//   "  - {pi2}",
//   "",
//   "[3. 검사 결과 지표 및 연관 Primitive Indicator]",
//   "아래 구조를 검사별로 반복하세요. 측정값은 SERVER_STRUCTURED_REPORT_DATA의 value를 우선 사용하고, 해석 표현은 SERVER_STRUCTURED_REPORT_DATA의 interpretation_label만 사용하세요. p25-p75 같은 percentile band는 해석 표현에 덧붙이지 마세요. 설명은 반드시 '{pi 이름} 값은 {측정값}로, {해석 표현}에 해당한다.' 형식의 담백한 관찰 문장으로 작성하세요. '높다', '낮다', '길다', '짧다', '길지 않다', '두드러지지 않는다', '주의력 저하', '가능성' 같은 추가 해석 표현을 붙이지 마세요. automatic processing(초기 자동처리), central discrimination(중심시야 기반 자극 판별), intra-subject variability(수행 시간 변동성), search coverage(시선 탐색 범위) 같은 KG 해석 용어와 임상적 시사점은 [3] 설명에 쓰지 말고 [4]에서 종합하세요.",
//   "■ Task명 : {task 이름}",
//   "- 연관 Primitive Indicator :",
//   "  - {pi1}",
//   "    - 측정값 : {pi1 측정값}",
//   "    - 해석 표현 : {pi1 해석 표현}",
//   "    - 설명 : {pi1 해석 설명}",
//   "  - {pi2}",
//   "    - 측정값 : {pi2 측정값}",
//   "    - 해석 표현 : {pi2 해석 표현}",
//   "    - 설명 : {pi2 해석 설명}",
//   "",
//   "[4. 센서 데이터 해석 및 임상적 시사점]",
//   "KG_FACTS의 use/range_hint를 우선 반영하고, KG_CONTEXT_ONLY_NOT_EVIDENCE는 방향성이 맞지 않거나 근거로 쓰기 어려운 참고 정보로만 사용하세요. use/range_hint 안에 automatic processing(초기 자동처리), central discrimination(중심시야 기반 자극 판별), intra-subject variability(수행 시간 변동성), search coverage(시선 탐색 범위) 중 하나라도 포함되어 있으면, 문장에 해당 용어를 영문+한글 괄호 형식 그대로 반드시 포함하세요. 해당 용어를 일반 표현으로 바꾸거나 생략하지 마세요. '보조', '보조적으로', '보조 소견', '보조 관찰' 표현을 쓰지 말고, 필요하면 '관찰 소견', '관련 가능성', '추가 확인이 필요한 소견'으로 바꿔 표현하세요. DSM-5 ADHD 진단 기준 A~E는 [4]에 쓰지말고 [5]에서 종합하세요. 단, PI 값만으로 진단이나 DSM-5 기준 충족을 단정하지 마세요.",
// ].join("\n");

// 0706
const OUTPUT_FORMAT_REQUIREMENT = [
  "[1. 개요] [2. 보고서의 근거가 되는 Task] [3. 검사 결과 지표 및 연관 Primitive Indicator] [4. 센서 데이터 해석 및 임상적 시사점] [5. DSM-5 진단 기준 확인 사항] 이 5개 섹션 형식에 맞게 답을 하되, SERVER_STRUCTURED_REPORT_DATA가 있으면 그 값을 우선 사용하세요. 없는 값은 추정하지 마세요.",
  "",
  "[1. 개요]",
  "SERVER_STRUCTURED_REPORT_DATA에 overview_sentence가 있으면 해당 문장을 그대로 1문장으로 사용하세요. Task 정의, PI 해석, DSM-5 관련 해석은 [1]에 쓰지 마세요.",
  "",
  "[2. 보고서의 근거가 되는 Task]",
  "아래 구조를 사용하세요. SERVER_STRUCTURED_REPORT_DATA의 task와 task_definition을 우선 사용하세요.",
  "■ Task명 : {task 이름}",
  "- 정의 : {task 정의}",
  "",
  "[3. 검사 결과 지표 및 연관 Primitive Indicator]",
  "아래 구조를 사용하세요. SERVER_STRUCTURED_REPORT_DATA의 performance_metrics와 primitive_indicators 값을 우선 사용하세요. [3]에서는 KG 해석 용어를 길게 설명하지 말고 값과 위치만 정리하세요.",
  "■ Task명 : {task 이름}",
  "- 검사 결과 지표 :",
  "  - 누락오류: {누락오류 개수} ({percentile})",
  "  - 오경보오류: {오경보오류 개수} ({percentile})",
  "  - 반응시간 평균: {반응시간 평균} ({percentile})",
  "  - 반응시간 표준편차: {반응시간 표준편차} ({percentile})",
  "- 연관 Primitive Indicator :",
  "  - {pi1}: {pi1 측정값} ({percentile})",
  "  - {pi2}: {pi2 측정값} ({percentile})",
  "",
  "[4. 센서 데이터 해석 및 임상적 시사점]",
  "KG_FACTS의 use/range_hint를 우선 반영하고, KG_CONTEXT_ONLY_NOT_EVIDENCE는 방향성이 맞지 않거나 근거로 쓰기 어려운 참고 정보로만 사용하세요. use/range_hint 안에 automatic processing(초기 자동처리), central discrimination(중심시야 기반 자극 판별), intra-subject variability(수행 시간 변동성), search coverage(시선 탐색 범위), target orienting(목표 정보 지향), distractor-target switching(방해-목표 간 시선 전환), target processing inefficiency(목표 정보 처리 비효율), intrusive saccade(불필요한 시선 이동), off-center gaze deviation(중앙 기준 시선 이탈), fixation maintenance(중앙 응시 유지) 중 하나라도 포함되어 있으면, 문장에 해당 용어를 영문+한글 괄호 형식 그대로 반드시 포함하세요. 해당 용어를 일반 표현으로 바꾸거나 생략하지 마세요. '보조', '보조적으로', '보조 소견', '보조 관찰' 표현을 쓰지 말고, 필요하면 '관찰 소견', '관련 가능성', '추가 확인이 필요한 소견'으로 바꿔 표현하세요. DSM-5 ADHD 진단 기준 A~E는 [4]에 쓰지말고 [5]에서 종합하세요. [4]에서는 누락오류, 오경보오류, 반응시간 평균, 반응시간 표준편차를 언급하지 마세요. 단, PI 값만으로 진단이나 DSM-5 기준 충족을 단정하지 마세요.",
].join("\n");

let cachedKg = null;

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadKg() {
  if (!cachedKg) {
    cachedKg = {
      dsm5: loadJson(DSM5_FILE),
      taskEdges: loadJson(TASK_EDGES_FILE),
      primitiveIndicators: loadJson(PRIMITIVE_INDICATORS_FILE),
    };
  }
  return cachedKg;
}

function latestUserText(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "user" && typeof message.content === "string") {
      return message.content;
    }
  }
  return "";
}

function includesAny(text, candidates) {
  const lower = text.toLowerCase();
  return candidates.some((candidate) => lower.includes(String(candidate).toLowerCase()));
}

function compactList(items, limit = 5) {
  if (items.length <= limit) {
    return items.join(", ");
  }
  return `${items.slice(0, limit).join(", ")} 외 ${items.length - limit}개`;
}

function compactText(value, maxLength = 300) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}...`;
}

function sanitizeModelReferenceText(value) {
  return String(value || "")
    .replace(/보조적으로\s*/g, "")
    .replace(/보조\s*소견/g, "관찰 소견")
    .replace(/보조\s*관찰/g, "관찰")
    .replace(/보조\s*지표/g, "참고 지표")
    .replace(/보조\s*정보/g, "참고 정보")
    .replace(/보조\s*근거/g, "참고 근거")
    .replace(/보조/g, "참고")
    .replace(/auxiliary observations/gi, "context observations");
}

function compactReferenceText(value, maxLength = 300) {
  return compactText(sanitizeModelReferenceText(value), maxLength);
}

function injectOutputFormatRequirement(content) {
  const source = String(content || "");
  if (source.includes("[OUTPUT_FORMAT_REQUIREMENT]")) {
    return source;
  }

  const block = [
    "[OUTPUT_FORMAT_REQUIREMENT]",
    OUTPUT_FORMAT_REQUIREMENT,
    "[/OUTPUT_FORMAT_REQUIREMENT]",
  ].join("\n");
  const userInputMarker = "\n\n[User Input]";
  if (source.includes(userInputMarker)) {
    return source.replace(userInputMarker, `\n\n${block}${userInputMarker}`);
  }
  return `${source}\n\n${block}`;
}

function directionHintForPi(text, pi) {
  const lowerText = text.toLowerCase();
  const lowerPi = String(pi).toLowerCase();
  const index = lowerText.indexOf(lowerPi);
  if (index === -1) {
    return "mentioned";
  }

  const afterPi = index + lowerPi.length;
  const nextPiIndex = lowerText.indexOf("et_", afterPi);
  const windowEnd = nextPiIndex === -1 ? Math.min(lowerText.length, index + lowerPi.length + 220) : nextPiIndex;
  const windowText = lowerText.slice(index, windowEnd);
  if (/p25\s*[-~–]\s*p75|p25\s*to\s*p75|중간\s*50|중간|평균\s*수준|middle|typical|average|reference\s*range/.test(windowText)) {
    return "typical_or_mid_range";
  }
  if (/p75\s*[-~–]\s*p90|p90\s*이상|p90|p75\s*이상|p75|상위\s*10\s*[-~–]\s*25|상위\s*10|상위|높|high|upper|above/.test(windowText)) {
    return "high_or_upper_percentile";
  }
  if (/p10\s*[-~–]\s*p25|p25\s*이하|p10|p25|하위|낮|low|lower|below/.test(windowText)) {
    return "low_or_lower_percentile";
  }
  if (/p25\s*-\s*p75|p25-p75|정상|평균|middle|typical/.test(windowText)) {
    return "typical_or_mid_range";
  }
  if (/p90|p75|상위|높|high|above|이상/.test(windowText)) {
    return "high_or_upper_percentile";
  }
  if (/p10|p25|하위|낮|low|below|이하/.test(windowText)) {
    return "low_or_lower_percentile";
  }
  return "mentioned";
}

function observationSnippetForPi(text, pi) {
  const source = String(text || "");
  const lowerText = source.toLowerCase();
  const lowerPi = String(pi || "").toLowerCase();
  const index = lowerText.indexOf(lowerPi);
  if (index === -1) {
    return "";
  }

  const afterPi = index + lowerPi.length;
  const nextPiIndex = lowerText.indexOf("et_", afterPi);
  const hardEnd = Math.min(
    nextPiIndex === -1 ? source.length : nextPiIndex,
    index + lowerPi.length + 180,
  );

  return source.slice(index, hardEnd).replace(/\s+/g, " ").replace(/[,\s]+$/g, "").trim();
}

function canonicalObservedDirection(observedDirection) {
  if (observedDirection === "high_or_upper_percentile") {
    return "high";
  }
  if (observedDirection === "low_or_lower_percentile") {
    return "low";
  }
  if (observedDirection === "typical_or_mid_range") {
    return "typical";
  }
  return "mentioned";
}

function requiredDirectionForEdge(direction) {
  const lower = String(direction || "").toLowerCase();
  if (!lower) {
    return "any";
  }
  if (/\bhigh\b|high_|_high|upper|p75|p90/.test(lower)) {
    return "high";
  }
  if (/\blow\b|low_|_low|lower|p10|p25/.test(lower)) {
    return "low";
  }
  return "any";
}

function edgeApplicability(observedDirection, kgDirection) {
  const observed = canonicalObservedDirection(observedDirection);
  const required = requiredDirectionForEdge(kgDirection);

  if (required === "any") {
    return {
      applies: true,
      status: "non_directional",
      observed,
      required,
      reason: "KG edge has no strict high/low direction requirement.",
    };
  }
  if (observed === "mentioned") {
    return {
      applies: false,
      status: "direction_not_observed",
      observed,
      required,
      reason: `The PI was mentioned, but the input did not provide a clear ${required} direction.`,
    };
  }
  if (observed === "typical") {
    return {
      applies: false,
      status: "reference_range_no_edge",
      observed,
      required,
      reason: "The observed value is in the mid/reference range, so the directional KG edge should not be applied.",
    };
  }
  if (observed === required) {
    return {
      applies: true,
      status: "direction_match",
      observed,
      required,
      reason: `Observed direction matches KG rule direction (${required}).`,
    };
  }
  return {
    applies: false,
    status: "direction_mismatch",
    observed,
    required,
    reason: `Observed direction (${observed}) does not match KG rule direction (${required}).`,
  };
}

function edgeTerms(edge) {
  return [edge.pi, ...(edge.aliases || [])].filter(Boolean);
}

function primitiveIndicatorForEdge(edge, primitiveIndicators) {
  const indicators = primitiveIndicators?.primitive_indicators || {};
  return indicators[edge.pi] || null;
}

function taskInterpretationForEdge(edge, taskName, primitiveIndicators) {
  const indicator = primitiveIndicatorForEdge(edge, primitiveIndicators);
  return indicator?.task_interpretations?.[taskName] || null;
}

function findMatchedEdgeTerm(segment, edge) {
  const lowerSegment = segment.toLowerCase();
  return edgeTerms(edge).find((term) => lowerSegment.includes(String(term).toLowerCase())) || null;
}

function firstAliasIndex(text, aliases) {
  const lower = text.toLowerCase();
  const indexes = aliases
    .map((alias) => lower.indexOf(String(alias).toLowerCase()))
    .filter((index) => index >= 0);
  return indexes.length ? Math.min(...indexes) : -1;
}

function aliasIndexes(text, alias) {
  const lower = text.toLowerCase();
  const needle = String(alias).toLowerCase();
  const indexes = [];
  let start = 0;
  while (needle && start < lower.length) {
    const index = lower.indexOf(needle, start);
    if (index === -1) {
      break;
    }
    indexes.push(index);
    start = index + needle.length;
  }
  return indexes;
}

function taskAliasHits(text, tasks) {
  const hitMap = new Map();
  for (const [taskName, task] of Object.entries(tasks)) {
    for (const alias of task.task_aliases || []) {
      for (const index of aliasIndexes(text, alias)) {
        hitMap.set(`${taskName}:${index}`, { taskName, index });
      }
    }
  }
  return Array.from(hitMap.values()).sort((a, b) => a.index - b.index);
}

function scopedTextsForTask(text, taskName, tasks) {
  const hits = taskAliasHits(text, tasks);
  const starts = hits.filter((hit) => hit.taskName === taskName).map((hit) => hit.index);
  if (!starts.length) {
    return [];
  }

  return starts.map((start) => {
    const nextOther = hits.find((hit) => hit.index > start && hit.taskName !== taskName);
    const end = nextOther ? nextOther.index : text.length;
    return text.slice(start, end);
  });
}

function shouldIncludeDsm5(text, matchedTasks) {
  return /dsm|adhd|진단|criterion|a1|a2|부주의|과잉행동|충동성/i.test(text) || matchedTasks.length > 0;
}

function buildDsm5Lines(dsm5) {
  const a1 = dsm5.criteria.A.A1_inattention;
  const a2 = dsm5.criteria.A.A2_hyperactivity_impulsivity;

  return [
    "DSM-5 ADHD reference constraints (brief):",
    `- Criterion A1 부주의는 ${a1.count}개 항목이며, 17세 미만은 ${a1.threshold_under_17}개 이상, 17세 이상은 ${a1.threshold_17_or_older}개 이상일 때 기준 충족 가능성을 검토한다.`,
    `- Criterion A2 과잉행동/충동성은 ${a2.count}개 항목이며, 17세 미만은 ${a2.threshold_under_17}개 이상, 17세 이상은 ${a2.threshold_17_or_older}개 이상일 때 기준 충족 가능성을 검토한다.`,
    `- Criterion A 증상은 ${dsm5.criteria.A.duration} 지속되어야 하며 발달 수준에 비해 부적절하고 기능에 부정적 영향이 있어야 한다.`,
    "- Criterion B/C/D/E도 별도 임상 정보가 있어야 판단한다.",
    "- 단일 센서 과제, CPT/CAT, eye-tracking 지표만으로 DSM-5 ADHD 진단 또는 Criterion A1/A2 충족을 단정하지 않는다.",
  ];
}

function dedupeMatchedEdgesByPi(edges) {
  const grouped = new Map();
  for (const edge of edges) {
    if (!grouped.has(edge.pi)) {
      grouped.set(edge.pi, []);
    }
    grouped.get(edge.pi).push(edge);
  }

  const deduped = [];
  for (const group of grouped.values()) {
    const applied = group.filter((edge) => edge.applies);
    if (applied.length) {
      deduped.push(...applied);
      continue;
    }

    const sorted = [...group].sort((a, b) => {
      const aScore = a.directionalReportRule ? 0 : 1;
      const bScore = b.directionalReportRule ? 0 : 1;
      return aScore - bScore;
    });
    deduped.push(sorted[0]);
  }

  return deduped;
}

function collectTaskMatches(text, taskEdges, primitiveIndicators) {
  const taskMatches = [];
  const matches = [];

  for (const [taskName, task] of Object.entries(taskEdges.tasks)) {
    const scopedTexts = scopedTextsForTask(text, taskName, taskEdges.tasks);
    if (!scopedTexts.length) {
      continue;
    }
    const allEdges = [...(task.edges || []), ...(task.conditional_edges || []), ...(task.guardrail_edges || [])];
    const rawMatchedEdges = allEdges
      .map((edge) => {
        let matchedTerm = null;
        const scopedText = scopedTexts.find((segment) => {
          matchedTerm = findMatchedEdgeTerm(segment, edge);
          return Boolean(matchedTerm);
        });
        if (!scopedText) {
          return null;
        }
        const observedDirection = directionHintForPi(scopedText, matchedTerm);
        const observedSnippet = observationSnippetForPi(scopedText, matchedTerm);
        const applicability = edgeApplicability(observedDirection, edge.direction);
        const taskInterpretation = taskInterpretationForEdge(edge, taskName, primitiveIndicators);
        const directionalReportRule =
          taskInterpretation?.directional_report_rules?.[applicability.observed] || null;
        return {
          task: taskName,
          pi: edge.pi,
          matchedTerm,
          observedSnippet,
          direction: edge.direction,
          observedDirection,
          observedBand: applicability.observed,
          requiredDirection: applicability.required,
          applies: applicability.applies,
          applicability: applicability.status,
          applicabilityReason: applicability.reason,
          polarity: edge.polarity || null,
          behaviorProxy: edge.behavior_proxy,
          attentionDomain: edge.attention_domain || null,
          reportBridge: edge.report_bridge || null,
          clinicalBridge: edge.clinical_bridge || null,
          primitiveIndicator: primitiveIndicatorForEdge(edge, primitiveIndicators),
          taskInterpretation,
          directionalReportRule,
          interpretation: edge.interpretation,
          caution: edge.caution || null,
          evidence: edge.evidence || null,
          grade: edge.kg_grade || "ungraded",
        };
      })
      .filter(Boolean);
    const matchedEdges = dedupeMatchedEdgesByPi(rawMatchedEdges);

    if (scopedTexts.length || matchedEdges.length > 0) {
      taskMatches.push({
        task: taskName,
        primaryBehaviorProxy: task.primary_behavior_proxy,
        description: task.task_description_ko || task.task_description,
        matchedEdges,
      });
      matches.push(...matchedEdges);
    }
  }

  return { taskMatches, matches };
}

function buildTaskLines(taskMatches) {
  if (!taskMatches.length) {
    return [];
  }

  const lines = ["Matched KG evidence (reference only):"];
  for (const taskMatch of taskMatches) {
    lines.push(`- ${taskMatch.task}: primary proxy = ${taskMatch.primaryBehaviorProxy}.`);

    if (!taskMatch.matchedEdges.length) {
      lines.push("  - Task was mentioned, but no specific PI edge was matched.");
      continue;
    }

    for (const edge of taskMatch.matchedEdges) {
      if (edge.applies) {
        const meaning = edge.taskInterpretation?.meaning || "";
        const reportSentence = edge.taskInterpretation?.report_sentence || edge.interpretation || "";
        const proxy = edge.taskInterpretation?.behavior_proxy || edge.behaviorProxy || "";
        lines.push(
          `  - ${edge.pi}: observed=${edge.observedDirection}; KG_direction=${edge.direction}; proxy=${proxy}; grade=${edge.grade}.`,
        );
        if (edge.primitiveIndicator) {
          lines.push(`    definition: ${edge.primitiveIndicator.definition}`);
          lines.push(`    unit: ${edge.primitiveIndicator.unit}`);
          if (edge.primitiveIndicator.higher_value_general_meaning) {
            lines.push(`    higher_value_general_meaning: ${edge.primitiveIndicator.higher_value_general_meaning}`);
          }
          if (edge.primitiveIndicator.lower_value_general_meaning) {
            lines.push(`    lower_value_general_meaning: ${edge.primitiveIndicator.lower_value_general_meaning}`);
          }
        }
        if (meaning) {
          lines.push(`    task_meaning: ${sanitizeModelReferenceText(meaning)}`);
        }
        if (reportSentence) {
          lines.push(`    interpretation_hint: ${sanitizeModelReferenceText(reportSentence)}`);
        }
        if (edge.taskInterpretation?.polarity || edge.polarity) {
          lines.push(`    polarity: ${edge.taskInterpretation?.polarity || edge.polarity}`);
        }
        if (edge.directionalReportRule?.report_hint) {
          lines.push(`    range_hint: ${sanitizeModelReferenceText(edge.directionalReportRule.report_hint)}`);
        }
        if (edge.caution) {
          lines.push(`    caution: ${edge.caution}`);
        }
        if (edge.evidence) {
          lines.push(`    evidence: ${edge.evidence}`);
        }
        if (edge.primitiveIndicator?.evidence?.length) {
          for (const evidence of edge.primitiveIndicator.evidence.slice(0, 2)) {
            lines.push(`    pi_evidence [${evidence.id}]: ${evidence.citation} ${evidence.url || ""}`);
            if (evidence.evidence_note) {
              lines.push(`      note: ${evidence.evidence_note}`);
            }
          }
        }
        if (edge.primitiveIndicator?.report_constraints?.length) {
          lines.push(`    constraints: ${edge.primitiveIndicator.report_constraints.join(" / ")}`);
        }
      } else {
        lines.push(
          `  - ${edge.pi}: observed=${edge.observedDirection}; KG_direction=${edge.direction}; applicability=${edge.applicability}; note=${edge.applicabilityReason}`,
        );
        if (edge.directionalReportRule?.report_hint) {
          lines.push(`    range_hint: ${sanitizeModelReferenceText(edge.directionalReportRule.report_hint)}`);
        }
      }
    }
  }

  return lines;
}

function buildAppliedEdgeChecklistLines() {
  return [];
}

function buildRuntimeReportContractLines(taskMatches) {
  const allEdges = taskMatches.flatMap((taskMatch) =>
    taskMatch.matchedEdges.map((edge) => ({ ...edge, task: taskMatch.task })),
  );
  const applicableEdges = allEdges.filter((edge) => edge.applies);
  const nonApplicableEdges = allEdges.filter((edge) => !edge.applies);

  if (!allEdges.length) {
    return [];
  }

  const lines = [
    "KG reference context (format-preserving):",
    "- Treat this KG as background knowledge, not as an answer template.",
    "- Preserve the user's requested structure or the model's learned answer format.",
    "- Do not add new sections or checklists solely because KG is present.",
    "- Use matched primitive-indicator facts only when directly relevant to the user's question.",
    "- p75-p90, p90 이상, p25-p75, and p10-p25 are percentile/reference bands, not p-values.",
    "- PI values are observation indicators; do not diagnose ADHD or claim DSM-5 criterion fulfillment from PI values alone.",
  ];

  if (applicableEdges.length) {
    lines.push("- Applicable PI references:");
    for (const edge of applicableEdges) {
      const meaning = edge.taskInterpretation?.meaning || edge.interpretation || "";
      const reportSentence = edge.taskInterpretation?.report_sentence || edge.reportBridge || edge.interpretation || "";
      const proxy = edge.taskInterpretation?.behavior_proxy || edge.behaviorProxy || "";
      lines.push(
        `  - ${edge.task}/${edge.pi}: user_observation="${edge.observedSnippet}"; observed=${edge.observedDirection}; behavior_proxy=${proxy}; task_meaning=${sanitizeModelReferenceText(meaning)}; interpretation_hint=${sanitizeModelReferenceText(reportSentence)}`,
      );
      if (edge.directionalReportRule?.report_hint) {
        lines.push(`    range_hint=${sanitizeModelReferenceText(edge.directionalReportRule.report_hint)}`);
      }
    }
  }

  if (nonApplicableEdges.length) {
    lines.push("- Mentioned but directionally non-applicable PI references:");
    for (const edge of nonApplicableEdges) {
      lines.push(
        `  - ${edge.task}/${edge.pi}: user_observation="${edge.observedSnippet}"; observed=${edge.observedDirection}; KG_direction=${edge.direction}; reason=${edge.applicabilityReason}`,
      );
      if (edge.directionalReportRule?.report_hint) {
        lines.push(`    range_hint=${sanitizeModelReferenceText(edge.directionalReportRule.report_hint)}`);
      }
    }
  }

  return lines;
}

function buildClinicalBridgeSummaryLines() {
  return [];
}

function buildKgContext(messages, options = {}) {
  const enabled = options.enabled !== false;
  if (!enabled) {
    return {
      enabled: false,
      applied: false,
      summary: "KG off",
      matches: [],
      contextText: "",
    };
  }

  const kg = loadKg();
  const userText = latestUserText(messages);
  const { taskMatches, matches } = collectTaskMatches(userText, kg.taskEdges, kg.primitiveIndicators);
  const includeDsm5 = shouldIncludeDsm5(userText, taskMatches);

  if (!includeDsm5 && !matches.length) {
    return {
      enabled: true,
      applied: false,
      summary: "KG on: no matching DSM/task/PI context",
      matches: [],
      contextText: "",
    };
  }

  const lines = [
    "[KG_CONTEXT]",
    "KG reference context. Use as background knowledge only, not as an answer template.",
    "Preserve the user's requested structure or the model's learned answer format; do not add sections solely because KG is present.",
    "",
  ];

  lines.push(...buildRuntimeReportContractLines(taskMatches), "");
  if (includeDsm5) {
    lines.push(...buildDsm5Lines(kg.dsm5), "");
  }
  lines.push("KG usage notes:");
  lines.push("- Use task-specific interpretation; do not transfer VST evidence to another task unless that task edge is matched.");
  lines.push("- Use cautious wording such as '시사한다', '관찰된다', '가능성을 검토할 수 있다'.");
  lines.push("- Keep KG evidence subordinate to the user's question and existing answer format.");
  lines.push("");
  lines.push(...buildTaskLines(taskMatches));
  lines.push("");
  lines.push("[/KG_CONTEXT]");

  const runtimeContractLines = buildRuntimeReportContractLines(taskMatches);
  const runtimeContextText = runtimeContractLines.length
    ? ["[KG_RUNTIME_COMPACT_CONTEXT]", ...runtimeContractLines, "[/KG_RUNTIME_COMPACT_CONTEXT]"].join("\n")
    : "";

  const taskDefinitions = taskMatches.map((item) => ({
    task: item.task,
    description: item.description || "",
    primaryBehaviorProxy: item.primaryBehaviorProxy || "",
  }));
  const taskNames = taskMatches.map((item) => item.task);
  const piNames = matches.map((item) => item.pi);
  const applicableMatches = matches.filter((item) => item.applies);
  const summaryBits = [];
  if (includeDsm5) {
    summaryBits.push("DSM-5 ADHD");
  }
  if (taskNames.length) {
    summaryBits.push(compactList(taskNames));
  }
  if (piNames.length) {
    summaryBits.push(`${applicableMatches.length}/${piNames.length} applicable PI edge`);
  }

  return {
    enabled: true,
    applied: true,
    summary: `KG on: ${summaryBits.join(" / ")}`,
    taskDefinitions,
    taskNames,
    piNames,
    applicableMatchCount: applicableMatches.length,
    matches,
    contextText: lines.join("\n").slice(0, KG_CONTEXT_MAX_CHARS),
    runtimeContextText: runtimeContextText.slice(0, 7000),
  };
}

function clinicalBridgeForEdge(edge) {
  return edge?.clinicalBridge || edge?.taskInterpretation?.clinical_bridge || null;
}

function clinicalBridgeRelatedItems(edge) {
  const bridge = clinicalBridgeForEdge(edge);
  return Array.isArray(bridge?.related_items) ? bridge.related_items : [];
}

function cleanDsmItemLabel(item) {
  return String(item || "")
    .replace(/^(?:A[12]|[A-E])(?:-[a-zA-Z0-9]+)?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function clinicalBridgeSummariesForEdges(edges) {
  const grouped = new Map();
  for (const edge of edges) {
    const bridge = clinicalBridgeForEdge(edge);
    const relatedItems = clinicalBridgeRelatedItems(edge).map(cleanDsmItemLabel).filter(Boolean);
    if (!bridge || !relatedItems.length) {
      continue;
    }

    const behaviorProxy = edge.taskInterpretation?.behavior_proxy || edge.behaviorProxy || "관련 행동 지표";
    const criterion = bridge.criterion || "DSM-5 related criterion";
    const criterionDomain = bridge.criterion_domain || "";
    const bridgeType = bridge.bridge_type || "auxiliary_observation_not_diagnostic";
    const key = [behaviorProxy, criterion, criterionDomain, bridgeType].join("||");
    if (!grouped.has(key)) {
      grouped.set(key, {
        behaviorProxy,
        criterion,
        criterionDomain,
        bridgeType,
        sourcePis: new Set(),
        relatedItems: new Set(),
      });
    }

    const item = grouped.get(key);
    item.sourcePis.add(edge.pi);
    relatedItems.forEach((relatedItem) => item.relatedItems.add(relatedItem));
  }

  return Array.from(grouped.values()).map((item) => ({
    behaviorProxy: item.behaviorProxy,
    criterion: item.criterion,
    criterionDomain: item.criterionDomain,
    bridgeType: item.bridgeType,
    sourcePis: Array.from(item.sourcePis),
    relatedItems: Array.from(item.relatedItems),
  }));
}

function buildTaskDefinitionReference(kgContext) {
  const definitions = Array.isArray(kgContext?.taskDefinitions) ? kgContext.taskDefinitions : [];
  if (!definitions.length) {
    return [];
  }

  const lines = ["검사 정의 참고:"];
  for (const item of definitions) {
    const task = compactText(item.task, 80) || "검사";
    const description = compactText(item.description, 260) || "제공되지 않음";
    const proxy = compactText(item.primaryBehaviorProxy, 120);
    lines.push(`- task=${task}; definition="${description}"${proxy ? `; primary_behavior_proxy="${proxy}"` : ""}`);
  }
  lines.push("[2]의 정의 항목에는 위 definition을 사용하고, task별 블록을 반드시 분리하세요.");
  return lines;
}

function buildInjectedKgReference(kgContext) {
  const matches = Array.isArray(kgContext?.matches) ? kgContext.matches : [];
  const applicable = matches.filter((edge) => edge.applies).slice(0, 12);
  const nonApplicable = matches.filter((edge) => !edge.applies).slice(0, 8);
  const lines = [
    "[KG_INTERPRETATION_REFERENCE]",
    "이 블록은 PI 해석 보정용 참고 지식이며 답변 형식이 아닙니다.",
    "KG_FACTS, KG_CONTEXT_ONLY_NOT_EVIDENCE, 임상 기준 연결 참고 같은 내부 label이나 KG라는 출처 라벨을 답변에 쓰지 말고, 필요한 해석만 자연스럽게 반영하세요.",
    "KG 원문에 '보조' 표현이 있더라도 답변에는 쓰지 말고 '관찰 소견', '관련 가능성', '추가 확인이 필요한 소견'으로 바꿔 표현하세요.",
    "p75-p90, p90 이상, p25-p75, p10-p25는 p-value가 아니라 reference band입니다.",
    "PI 값만으로 DSM-5 ADHD 진단 또는 Criterion A 충족을 단정하지 마세요.",
    "KG_CONTEXT_ONLY_NOT_EVIDENCE에 있는 PI는 방향성이 맞지 않는 참고이므로 어려움/저하의 근거로 종합하지 말고, 중립 또는 제한 소견 부재로 기술하세요.",
  ];

  const taskDefinitionLines = buildTaskDefinitionReference(kgContext);
  if (taskDefinitionLines.length) {
    lines.push("", ...taskDefinitionLines);
  }

  if (applicable.length) {
    lines.push("KG_FACTS:");
    applicable.forEach((edge, index) => {
      const meaning = edge.taskInterpretation?.meaning || edge.interpretation || "";
      const reportSentence =
        edge.directionalReportRule?.report_hint ||
        edge.taskInterpretation?.report_sentence ||
        edge.reportBridge ||
        edge.interpretation ||
        "";
      lines.push(
        `- ${index + 1}. task=${edge.task}; pi=${edge.pi}; observed=${edge.observedDirection}; observation="${compactText(edge.observedSnippet, 180)}"; meaning="${compactReferenceText(meaning, 220)}"; use="${compactReferenceText(reportSentence, 280)}"`,
      );
    });
  }

  const clinicalBridges = clinicalBridgeSummariesForEdges(applicable).slice(0, 8);
  if (clinicalBridges.length) {
    lines.push("임상 기준 연결 참고:");
    clinicalBridges.forEach((bridge, index) => {
      lines.push(
        '- ' +
          (index + 1) +
          '. behavior_proxy="' +
          compactText(bridge.behaviorProxy, 120) +
          '"; criterion="' +
          compactText(bridge.criterion, 160) +
          '"; criterion_domain="' +
          compactText(bridge.criterionDomain, 120) +
          '"; bridge_type="' +
          compactText(bridge.bridgeType, 120) +
          '"; source_pi="' +
          bridge.sourcePis.join(', ') +
          '"; related_items="' +
          bridge.relatedItems.join(' | ') +
          '"; use="[5]에서 진단 단정 없이 추가 확인 항목으로 제시"',
      );
    });
  }
  if (nonApplicable.length) {
    lines.push("KG_CONTEXT_ONLY_NOT_EVIDENCE:");
    nonApplicable.forEach((edge, index) => {
      const hint =
        edge.directionalReportRule?.report_hint ||
        edge.taskInterpretation?.report_template?.high_value_phrase ||
        edge.taskInterpretation?.report_template?.typical_value_phrase ||
        edge.applicabilityReason ||
        "";
      lines.push(
        `- ${index + 1}. task=${edge.task}; pi=${edge.pi}; observed=${edge.observedDirection}; kg_direction=${edge.direction}; reason="${compactText(edge.applicabilityReason, 220)}"; use="${compactReferenceText(hint, 280)}"`,
      );
    });
  }

  lines.push("[/KG_INTERPRETATION_REFERENCE]");
  return lines.join("\n").slice(0, 5000);
}

function injectKgContext(messages, kgContext) {
  if (!kgContext || !kgContext.contextText) {
    return messages;
  }

  const kgReference = buildInjectedKgReference(kgContext);
  const lastUserIndex = messages.reduce((lastIndex, message, index) => {
    return message.role === "user" ? index : lastIndex;
  }, -1);

  if (lastUserIndex === -1) {
    return [{ role: "user", content: kgReference }, ...messages];
  }

  return messages.map((message, index) => {
    if (index !== lastUserIndex) {
      return message;
    }
    return {
      ...message,
      content: [injectOutputFormatRequirement(message.content), "", kgReference].join("\n"),
    };
  });
}

function summarizeKgForClient(kgContext) {
  return {
    enabled: Boolean(kgContext?.enabled),
    applied: Boolean(kgContext?.applied),
    summary: kgContext?.summary || "KG off",
    taskNames: kgContext?.taskNames || [],
    piNames: kgContext?.piNames || [],
    applicableMatchCount: Number.isFinite(kgContext?.applicableMatchCount) ? kgContext.applicableMatchCount : 0,
    matchCount: Array.isArray(kgContext?.matches) ? kgContext.matches.length : 0,
  };
}

module.exports = {
  buildKgContext,
  injectKgContext,
  summarizeKgForClient,
};
