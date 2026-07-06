const fs = require("node:fs");
const path = require("node:path");

const DSM5_FILE = path.join(__dirname, "kg", "dsm5_adhd_criteria_v1.json");

let cachedDsm5 = null;

function loadDsm5() {
  if (!cachedDsm5) {
    cachedDsm5 = JSON.parse(fs.readFileSync(DSM5_FILE, "utf8"));
  }
  return cachedDsm5;
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

function shouldApplyDsm5CoreGuardrail(messages) {
  const text = latestUserText(messages);
  return /adhd|dsm|criterion|a1|a2|부주의|과잉행동|충동성/i.test(text);
}

function numbered(items) {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function includesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function extractFirstNumber(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return Number(match[1]);
    }
  }
  return null;
}

function statusText(value) {
  if (value === true) return "충족";
  if (value === false) return "미충족";
  return "정보 부족";
}

function buildParsedCaseNote(userText) {
  const normalized = userText.replace(/\s+/g, " ");
  const isCaseLike = /\[Input\]|사례|학생|성인|내담자|보호자|직장|가정|학교/i.test(normalized);
  if (!isCaseLike) {
    return [];
  }

  const age = extractFirstNumber(normalized, [/(\d{1,2})\s*세/]);
  const a1 = extractFirstNumber(normalized, [
    /A1[^0-9]{0,30}(\d+)\s*개/i,
    /부주의\s*증상(?:은|이)?\s*(\d+)\s*개/i,
  ]);
  const a2 = extractFirstNumber(normalized, [
    /A2[^0-9]{0,30}(\d+)\s*개/i,
    /과잉행동\/?충동성\s*증상(?:은|이)?\s*(\d+)\s*개/i,
    /과잉행동[^0-9]{0,20}충동성[^0-9]{0,20}(\d+)\s*개/i,
  ]);
  const durationMonths = extractFirstNumber(normalized, [/(\d+)\s*개월/]);
  const threshold = age == null ? null : age <= 16 ? 6 : 5;
  const ageRule =
    age == null
      ? "연령 정보가 없으면 16세 이하/17세 이상 기준을 확정할 수 없다."
      : age <= 16
        ? `${age}세는 16세 이하 기준이므로 A1 또는 A2 중 한 영역에서 6개 이상이 필요하다.`
        : `${age}세는 17세 이상 기준이므로 A1 또는 A2 중 한 영역에서 5개 이상이 필요하다.`;

  const a1Met = threshold == null || a1 == null ? null : a1 >= threshold;
  const a2Met = threshold == null || a2 == null ? null : a2 >= threshold;
  const durationMet = durationMonths == null ? null : durationMonths >= 6;

  const bFailed = includesAny(normalized, [
    /12세\s*이전[^.。]*없/,
    /12\s*세\s*전[^.。]*없/,
    /14세\s*이후/,
    /12세\s*이전에는\s*유사\s*증상이\s*없/,
  ]);
  const bMet = !bFailed && includesAny(normalized, [/12세\s*이전[^.。]*(있|보고|확인|일부)/, /12\s*세\s*전[^.。]*(있|보고|확인|일부)/]);

  const cFailed = includesAny(normalized, [/학교에서만/, /한\s*환경/, /다른\s*환경[^.。]*(확인되지|없)/, /가정[^.。]*(확인되지|없)/]);
  const cMet = !cFailed && includesAny(normalized, [/집과\s*학교/, /학교와\s*집/, /가정과\s*학교/, /학교와\s*가정/, /직장과\s*가정/, /2개\s*이상\s*환경/]);

  const dMissing = includesAny(normalized, [/기능\s*손상\s*정보[^.。]*(없|아직)/, /기능[^.。]*정보는\s*아직\s*없/]);
  const dMet = !dMissing && includesAny(normalized, [/기능\s*손상/, /기능\s*저하/, /업무\s*기능\s*저하/, /학업\s*기능\s*저하/, /또래\s*관계\s*기능/]);

  const eBlocking = includesAny(normalized, [/더\s*잘\s*설명할\s*가능성/, /우울\s*삽화/, /수면\s*박탈/, /감별[^.。]*(아직|진행\s*중|완료되지|미완료)/]);
  const eMet = !eBlocking && includesAny(normalized, [/더\s*잘\s*설명[^.。]*(근거는\s*없|근거가\s*없|없다)/, /감별진단은\s*모두\s*확인/, /감별진단상\s*다른[^.。]*근거는\s*없/]);

  const hasCaseNumbers = age != null || a1 != null || a2 != null || durationMonths != null || bMet || bFailed || cMet || cFailed || dMet || dMissing || eMet || eBlocking;
  if (!hasCaseNumbers) {
    return [];
  }

  const criterionAMet = (a1Met === true || a2Met === true) && durationMet !== false;
  const blockers = [];
  if (criterionAMet !== true) blockers.push("Criterion A");
  if (bFailed || !bMet) blockers.push("Criterion B");
  if (cFailed || !cMet) blockers.push("Criterion C");
  if (dMissing || !dMet) blockers.push("Criterion D");
  if (eBlocking || !eMet) blockers.push("Criterion E");

  let presentation = "표현형은 A1/A2 증상 수와 A-E 전체 기준을 함께 본 뒤 제한해서 쓴다.";
  if (threshold != null && a1 != null && a2 != null) {
    if (a1Met && a2Met) {
      presentation = blockers.length === 0
        ? "A1과 A2가 모두 연령별 증상 수 기준을 충족하므로 복합 표현형 가능성을 검토할 수 있다."
        : "A1과 A2가 모두 증상 수 기준을 충족해도 A-E 중 미충족/정보 부족 기준이 있으면 복합 표현형을 최종 진단명처럼 쓰지 않는다.";
    } else if (a1Met && !a2Met) {
      presentation = "A1만 연령별 증상 수 기준을 충족하고 A2는 미달이므로 복합 표현형이 아니라 주의력결핍 우세 표현형 가능성만 제한적으로 검토한다.";
    } else if (!a1Met && a2Met) {
      presentation = "A2만 연령별 증상 수 기준을 충족하고 A1은 미달이므로 복합 표현형이 아니라 과잉행동/충동성 우세 표현형 가능성만 제한적으로 검토한다.";
    } else {
      presentation = "A1과 A2 모두 연령별 증상 수 기준에 미달하므로 ADHD 표현형을 제시하지 않는다.";
    }
  }

  return [
    "",
    "사례 적용 안전 점검:",
    `- 연령 기준: ${ageRule}`,
    `- A1 부주의 증상 수: ${a1 == null ? "정보 부족" : `${a1}개`} -> ${statusText(a1Met)}.`,
    `- A2 과잉행동/충동성 증상 수: ${a2 == null ? "정보 부족" : `${a2}개`} -> ${statusText(a2Met)}.`,
    `- 6개월 지속: ${durationMonths == null ? "정보 부족" : `${durationMonths}개월`} -> ${statusText(durationMet)}.`,
    `- Criterion B: ${bFailed ? "12세 이전 일부 증상이 없거나 14세 이후 시작으로 보고되어 미충족" : bMet ? "12세 이전 일부 증상 근거가 있어 충족 가능" : "12세 이전 일부 증상 정보 부족"}.`,
    `- Criterion C: ${cFailed ? "한 환경에서만 확인되어 미충족" : cMet ? "2개 이상 환경에서 확인되어 충족 가능" : "2개 이상 환경 정보 부족"}.`,
    `- Criterion D: ${dMissing ? "기능 방해 또는 질 저하 정보가 없어 정보 부족" : dMet ? "기능 방해 또는 질 저하 근거가 있어 충족 가능" : "기능 방해 또는 질 저하 정보 부족"}.`,
    `- Criterion E: ${eBlocking ? "다른 정신질환/수면/의학적 상태/물질 영향 등이 더 잘 설명할 가능성이 있어 미충족 또는 보류" : eMet ? "다른 원인으로 더 잘 설명된다는 근거가 없어 충족 가능" : "감별진단 정보 부족"}.`,
    `- 표현형 제한: ${presentation}`,
    `- 최종 제한: ${blockers.length === 0 ? "제시 정보만으로는 DSM-5 ADHD 기준 충족 가능성을 검토할 수 있지만, 최종 진단은 면허가 있는 임상가의 종합 평가가 필요하다." : `${blockers.join(", ")} 때문에 ADHD 진단을 확정하지 않는다.`}`,
  ];
}

function buildDsm5SafetyAppendix(messages) {
  if (!shouldApplyDsm5CoreGuardrail(messages)) {
    return "";
  }

  const userText = latestUserText(messages);
  const dsm5 = loadDsm5();
  const criterionA = dsm5.criteria.A;
  const a1 = criterionA.A1_inattention;
  const a2 = criterionA.A2_hyperactivity_impulsivity;
  const asksCriterionBMeaning = /Criterion\s*B|기준\s*B|12세\s*이전/i.test(userText) && /공식|진단명|진단을\s*받/i.test(userText);
  const asksLabelCorrection = /6\s*개월.*Criterion\s*B|Criterion\s*B.*6\s*개월|12세\s*이전.*Criterion\s*C|기능\s*손상.*Criterion\s*E/i.test(userText);

  const lines = [
    "",
    "",
    "[DSM-5 ADHD 핵심 기준 안전 점검]",
    "아래 블록은 모델 답변의 누락이나 라벨 혼동을 막기 위한 고정 기준이다.",
    "",
    "Criterion A: A1 부주의 증상군과 A2 과잉행동/충동성 증상군, 연령별 증상 수, 최소 6개월 지속, 발달 수준에 비해 부적절함, 기능에 대한 부정적 영향을 함께 확인한다.",
    "Criterion B: 여러 부주의 또는 과잉행동/충동성 증상 중 일부가 12세 이전에 존재해야 한다.",
    "Criterion C: 여러 증상이 2개 이상 환경에서 확인되어야 한다.",
    "Criterion D: 증상이 사회적, 학업적, 직업적 기능을 방해하거나 기능의 질을 낮춘다는 명확한 증거가 필요하다.",
    "Criterion E: 증상이 다른 정신질환, 의학적 상태, 물질 영향 등으로 더 잘 설명되지 않아야 한다.",
    "",
    "연령별 증상 수 기준:",
    `- 16세 이하: A1 또는 A2 중 한 영역에서 ${a1.threshold_under_17}개 이상이 필요하다.`,
    `- 17세 이상: A1 또는 A2 중 한 영역에서 ${a1.threshold_17_or_older}개 이상이 필요하다.`,
    "- 16세에게 17세 이상 기준인 5개를 적용하지 않는다.",
    "",
    "A1 부주의 9개 항목:",
    numbered(a1.items_ko || []),
    "",
    "A2 과잉행동/충동성 9개 항목:",
    numbered(a2.items_ko || []),
    "",
    "라벨 혼동 금지:",
    "- 6개월 이상 지속은 Criterion A 안의 조건이지 Criterion B가 아니다.",
    "- 12세 이전 일부 증상은 Criterion B이지 Criterion C가 아니다.",
    "- 2개 이상 환경은 Criterion C다.",
    "- 기능 방해 또는 질 저하는 Criterion D다.",
    "- 감별진단/다른 원인으로 더 잘 설명되지 않음은 Criterion E다.",
  ];

  if (asksLabelCorrection) {
    lines.push(
      "",
      "질문 속 라벨 정정:",
      "- 사용자가 제시한 라벨 설명은 맞지 않다.",
      "- 6개월 이상 지속은 Criterion A, 12세 이전 일부 증상은 Criterion B, 2개 이상 환경은 Criterion C, 기능 방해 또는 질 저하는 Criterion D, 감별진단은 Criterion E로 바로잡아야 한다.",
    );
  }

  if (asksCriterionBMeaning) {
    lines.push(
      "",
      "Criterion B 의미:",
      "- Criterion B는 12세 이전 공식 ADHD 진단명이 필요하다는 뜻이 아니다.",
      "- 12세 이전 여러 증상 중 일부가 존재했다는 발달력 근거가 있으면 충족 가능성을 검토할 수 있다.",
      "- 12세 이전 증상 정보가 전혀 없으면 Criterion B는 정보 부족으로 표시한다.",
    );
  }

  lines.push(...buildParsedCaseNote(userText));
  lines.push("[/DSM-5 ADHD 핵심 기준 안전 점검]");
  return lines.join("\n");
}

function buildDsm5CoreGuardrail(messages) {
  if (!shouldApplyDsm5CoreGuardrail(messages)) {
    return { applied: false, contextText: "" };
  }

  const dsm5 = loadDsm5();
  const criterionA = dsm5.criteria.A;
  const a1 = criterionA.A1_inattention;
  const a2 = criterionA.A2_hyperactivity_impulsivity;

  return {
    applied: true,
    contextText: [
      "[DSM5_ADHD_CORE_GUARDRAIL]",
      "다음 DSM-5 ADHD 핵심 기준은 답변에서 라벨을 바꾸지 말고 우선 적용해야 하는 안전 컨텍스트다.",
      "",
      "Criterion A: A1 부주의 증상군과 A2 과잉행동/충동성 증상군, 연령별 증상 수, 최소 6개월 지속, 발달 수준에 비해 부적절함, 기능에 대한 부정적 영향을 함께 확인한다.",
      "Criterion B: 여러 부주의 또는 과잉행동/충동성 증상 중 일부가 12세 이전에 존재해야 한다.",
      "Criterion C: 여러 증상이 2개 이상 환경에서 확인되어야 한다.",
      "Criterion D: 증상이 사회적, 학업적, 직업적 기능을 방해하거나 기능의 질을 낮춘다는 명확한 증거가 필요하다.",
      "Criterion E: 증상이 다른 정신질환, 의학적 상태, 물질 영향 등으로 더 잘 설명되지 않아야 한다.",
      "",
      "연령별 증상 수 기준:",
      `- 16세 이하: A1 또는 A2 중 한 영역에서 ${a1.threshold_under_17}개 이상이 필요하다.`,
      `- 17세 이상: A1 또는 A2 중 한 영역에서 ${a1.threshold_17_or_older}개 이상이 필요하다.`,
      "- 16세에게 17세 이상 기준인 5개를 적용하지 않는다.",
      "",
      "A1 부주의 9개 항목:",
      numbered(a1.items_ko || []),
      "",
      "A2 과잉행동/충동성 9개 항목:",
      numbered(a2.items_ko || []),
      "",
      "금지할 라벨 혼동:",
      "- 6개월 지속을 Criterion B라고 쓰지 않는다. 6개월 지속은 Criterion A 안의 조건이다.",
      "- 12세 이전 일부 증상을 Criterion C라고 쓰지 않는다. 12세 이전 일부 증상은 Criterion B다.",
      "- 2개 이상 환경을 Criterion B 또는 D라고 쓰지 않는다. 2개 이상 환경은 Criterion C다.",
      "- 기능 방해 또는 질 저하를 Criterion E라고 쓰지 않는다. 기능 방해 또는 질 저하는 Criterion D다.",
      "- 감별진단/다른 원인으로 더 잘 설명되지 않음은 Criterion E다.",
      "",
      "판단 제한:",
      "- A1만 기준 충족이면 주의력결핍 우세 표현형 가능성을 검토하고, 복합 표현형이라고 쓰지 않는다.",
      "- A2만 기준 충족이면 과잉행동/충동성 우세 표현형 가능성을 검토하고, 복합 표현형이라고 쓰지 않는다.",
      "- A1과 A2가 모두 기준 충족일 때만 복합 표현형 가능성을 검토한다.",
      "- Criterion B, C, D, E 중 하나라도 미충족 또는 정보 부족이면 ADHD 진단을 확정하지 않는다.",
      "- Criterion E에서 다른 정신질환, 의학적 상태, 물질 영향 등이 더 나은 설명이면 ADHD 진단을 확정하지 않는다.",
      "[/DSM5_ADHD_CORE_GUARDRAIL]",
    ].join("\n"),
  };
}

function injectDsm5CoreGuardrail(messages, guardrail) {
  if (!guardrail?.contextText) {
    return messages;
  }

  const guardrailMessage = {
    role: "system",
    content: guardrail.contextText,
  };
  const lastSystemIndex = messages.reduce((lastIndex, message, index) => {
    return message.role === "system" ? index : lastIndex;
  }, -1);

  if (lastSystemIndex === -1) {
    return [guardrailMessage, ...messages];
  }

  return [
    ...messages.slice(0, lastSystemIndex + 1),
    guardrailMessage,
    ...messages.slice(lastSystemIndex + 1),
  ];
}

module.exports = {
  buildDsm5CoreGuardrail,
  buildDsm5SafetyAppendix,
  injectDsm5CoreGuardrail,
};
