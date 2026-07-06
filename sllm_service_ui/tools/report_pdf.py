#!/usr/bin/env python3
import json
import os
import re
import sys
from datetime import datetime
from html import escape
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate, Flowable, Frame, KeepTogether, PageTemplate, Paragraph, Spacer, Table, TableStyle


PAGE_WIDTH, PAGE_HEIGHT = A4
FONT_NAME = "ReportKorean"
BOLD_FONT_NAME = "ReportKoreanBold"
TITLE_FONT_SIZE = 22
REPORT_TITLE = "센서 데이터 기반 주의 집중력 분석 보고서"
BODY_FONT_FILE = "NanumGothic-Regular.ttf"
BOLD_FONT_FILE = "NanumGothic-Bold.ttf"
ACTIVE_BOLD_FONT_NAME = FONT_NAME
STUDENT_INFO_TITLE_BOLD = True
STUDENT_INFO_LABEL_BOLD = True
STUDENT_INFO_VALUE_BOLD = False
SYNTHETIC_BOLD_STROKE = 0.2
NAVY = colors.HexColor("#062554")
DEEP_BLUE = colors.HexColor("#102f84")
TEXT = colors.HexColor("#15223b")
MUTED = colors.HexColor("#6c7484")
LINE = colors.HexColor("#d8deea")
SOFT_BLUE = colors.HexColor("#f5f8ff")
SOFT_GREEN = colors.HexColor("#eef8f4")
SOFT_RED = colors.HexColor("#ff939a")

FEATURE_BODY_FONT_SIZE = 10.0
FEATURE_BODY_LINE_HEIGHT = 5 * mm
GRAPH_BAND_THICKNESS = 2
TASK_HEADER_HEIGHT = 9.5 * mm
METRIC_ROW_HEIGHT = 9 * mm
OBSERVATION_CELL_HEIGHT = 40 * mm
TABLE_TASK_HEADER_FONT_SIZE = 12
TABLE_LABEL_FONT_SIZE = 10.5
SECTION_HEADER_NUMBER_FONT_SIZE = 10
SECTION_HEADER_TITLE_FONT_SIZE = 12
SECTION_HEADER_CIRCLE_X = 5.5 * mm
SECTION_HEADER_TITLE_X = 12.2 * mm
SECTION_HEADER_RIGHT_PADDING = SECTION_HEADER_CIRCLE_X


def font_candidates():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    app_dir = os.path.dirname(script_dir)
    candidates = [
        os.environ.get("PDF_FONT_PATH", ""),
        os.path.join(app_dir, "assets", "fonts", BODY_FONT_FILE),
        "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJKkr-Regular.otf",
    ]
    return [path for path in candidates if path]


def bold_font_candidates():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    app_dir = os.path.dirname(script_dir)
    candidates = [
        os.environ.get("PDF_BOLD_FONT_PATH", ""),
        os.path.join(app_dir, "assets", "fonts", BOLD_FONT_FILE),
        "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
        "/usr/share/fonts/truetype/nanum/NanumGothic-Bold.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJKkr-Bold.otf",
    ]
    return [path for path in candidates if path]



def register_font(font_name, candidates):
    errors = []
    for path in candidates:
        if not os.path.exists(path):
            continue
        try:
            pdfmetrics.registerFont(TTFont(font_name, path))
            return path
        except Exception as exc:
            errors.append(f"{path}: {exc}")
    detail = "; ".join(errors) if errors else f"no usable font found for {font_name}"
    raise RuntimeError(f"Font registration failed for {font_name}: {detail}")


def register_optional_font(font_name, candidates):
    for path in candidates:
        if not os.path.exists(path):
            continue
        try:
            pdfmetrics.registerFont(TTFont(font_name, path))
            return path
        except Exception:
            continue
    return ""


def register_korean_font():
    global ACTIVE_BOLD_FONT_NAME
    body_path = register_font(FONT_NAME, font_candidates())
    bold_path = register_optional_font(BOLD_FONT_NAME, bold_font_candidates())
    ACTIVE_BOLD_FONT_NAME = BOLD_FONT_NAME if bold_path else FONT_NAME
    return {"body": body_path, "bold": bold_path}


def draw_synthetic_bold_text(
    canvas,
    x,
    y,
    text,
    font_size,
    color,
    align="left",
    stroke_width=SYNTHETIC_BOLD_STROKE,
):
    value = str(text or "")
    if not value:
        return

    text_width = pdfmetrics.stringWidth(value, FONT_NAME, font_size)
    if align == "center":
        x -= text_width / 2
    elif align == "right":
        x -= text_width

    canvas.saveState()
    canvas.setFillColor(color)
    canvas.setStrokeColor(color)
    canvas.setLineWidth(stroke_width)
    text_obj = canvas.beginText(x, y)
    text_obj.setFont(FONT_NAME, font_size)
    text_obj.setTextRenderMode(2)
    text_obj.textOut(value)
    canvas.drawText(text_obj)
    canvas.restoreState()


def centered_text_baseline(font_name, font_size, center_y):
    return center_y - (pdfmetrics.getAscent(font_name, font_size) + pdfmetrics.getDescent(font_name, font_size)) / 2


def text_value(payload, key, default=""):
    value = payload.get(key, default)
    if value is None:
        return default
    return str(value)


def clean_text(value, limit=120000):
    text = str(value or "")
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "")
    return text[:limit].strip()


def compact_text(value, limit=120):
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text if len(text) <= limit else f"{text[: limit - 1]}..."


def paragraph(text, style):
    safe = escape(str(text or "")).replace("\n", "<br/>")
    return Paragraph(safe or " ", style)


def make_styles():
    def base(font_name=FONT_NAME):
        return {
            "fontName": font_name,
        }

    def student_info_font(use_bold):
        return ACTIVE_BOLD_FONT_NAME if use_bold else FONT_NAME

    regular_base = base()
    return {
        "info_title": ParagraphStyle(
            "info_title",
            **base(student_info_font(STUDENT_INFO_TITLE_BOLD)),
            fontSize=13,
            leading=18,
            textColor=NAVY,
            spaceAfter=5,
        ),
        "label": ParagraphStyle(
            "label",
            **base(student_info_font(STUDENT_INFO_LABEL_BOLD)),
            fontSize=9,
            leading=15,
            textColor=MUTED,
        ),
        "value": ParagraphStyle(
            "value",
            **base(student_info_font(STUDENT_INFO_VALUE_BOLD)),
            fontSize=11,
            leading=15,
            textColor=TEXT,
        ),
        "exam_title": ParagraphStyle(
            "exam_title",
            **base(ACTIVE_BOLD_FONT_NAME),
            fontSize=TABLE_TASK_HEADER_FONT_SIZE,
            leading=15,
            textColor=DEEP_BLUE,
            alignment=TA_CENTER,
        ),
        "exam_label": ParagraphStyle(
            "exam_label",
            **base(ACTIVE_BOLD_FONT_NAME),
            fontSize=TABLE_LABEL_FONT_SIZE,
            leading=12,
            textColor=DEEP_BLUE,
            alignment=TA_CENTER,
        ),
        "body": ParagraphStyle(
            "body",
            **regular_base,
            fontSize=10,
            leading=18,
            textColor=TEXT,
            spaceAfter=4,
            alignment=TA_LEFT,
        ),
        "bullet": ParagraphStyle(
            "bullet",
            **regular_base,
            fontSize=10,
            leading=15,
            textColor=TEXT,
            leftIndent=9,
            firstLineIndent=-6,
            spaceAfter=2,
        ),
        "subsection": ParagraphStyle(
            "subsection",
            **regular_base,
            fontSize=10,
            leading=15,
            textColor=NAVY,
            spaceBefore=2,
            spaceAfter=3,
        ),
        "note": ParagraphStyle(
            "note",
            **regular_base,
            fontSize=8,
            leading=12,
            textColor=MUTED,
        ),
    }


class SectionHeader(Flowable):
    def __init__(self, number, title):
        super().__init__()
        self.number = str(number)
        self.title = str(title)
        self.height = 12 * mm
        self.pill_width = 70 * mm

    def wrap(self, avail_width, avail_height):
        text_width = pdfmetrics.stringWidth(self.title, FONT_NAME, SECTION_HEADER_TITLE_FONT_SIZE)
        self.pill_width = min(avail_width, SECTION_HEADER_TITLE_X + text_width + SECTION_HEADER_RIGHT_PADDING)
        return avail_width, self.height

    def draw(self):
        canvas = self.canv
        y = 1.2 * mm
        h = 9.8 * mm
        r = 2.2 * mm
        center_y = y + h / 2
        canvas.saveState()
        canvas.setFillColor(DEEP_BLUE)
        canvas.roundRect(0, y, self.pill_width, h, r, stroke=0, fill=1)
        canvas.setFillColor(colors.white)
        canvas.circle(SECTION_HEADER_CIRCLE_X, center_y, 3.4 * mm, stroke=0, fill=1)
        draw_synthetic_bold_text(
            canvas,
            SECTION_HEADER_CIRCLE_X,
            centered_text_baseline(FONT_NAME, SECTION_HEADER_NUMBER_FONT_SIZE, center_y),
            self.number,
            SECTION_HEADER_NUMBER_FONT_SIZE,
            NAVY,
            align="center",
            stroke_width=0.18,
        )
        draw_synthetic_bold_text(
            canvas,
            SECTION_HEADER_TITLE_X,
            centered_text_baseline(FONT_NAME, SECTION_HEADER_TITLE_FONT_SIZE, center_y),
            self.title,
            SECTION_HEADER_TITLE_FONT_SIZE,
            colors.white,
            stroke_width=0.18,
        )
        canvas.restoreState()


def band_range_from_text(text):
    band = str(text or "").lower().replace(" ", "")
    percent_numbers = re.findall(r"(\d+)\s*(?:~|-)\s*(\d+)?|(\d+)\s*%", band)
    flat_percent_numbers = []
    for item in percent_numbers:
        for value in item:
            if value != "":
                flat_percent_numbers.append(int(value))
    if "상위" in band and flat_percent_numbers:
        if len(flat_percent_numbers) >= 2:
            low, high = sorted(flat_percent_numbers[:2])
            return max(0, 100 - high), min(100, 100 - low)
        value = flat_percent_numbers[0]
        return max(0, 100 - value), 100
    if "하위" in band and flat_percent_numbers:
        if len(flat_percent_numbers) >= 2:
            low, high = sorted(flat_percent_numbers[:2])
            return max(0, low), min(100, high)
        value = flat_percent_numbers[0]
        return 0, min(100, value)

    numbers = [int(value) for value in re.findall(r"p(\d+)", band)]
    if len(numbers) >= 2:
        start, end = numbers[0], numbers[1]
        return max(0, min(start, 100)), max(0, min(end, 100))
    if len(numbers) == 1:
        value = max(0, min(numbers[0], 100))
        if "이상" in band or value >= 90:
            return value, 100
        if "이하" in band:
            return 0, value
        return max(0, value - 10), min(100, value + 10)
    return 25, 75


def band_color(band):
    start, end = band_range_from_text(band)
    if start >= 90 or "p90" in str(band).lower().replace(" ", ""):
        return SOFT_RED, colors.HexColor("#c43d48")
    if start >= 75 or end >= 90:
        return colors.HexColor("#eef2ff"), DEEP_BLUE
    if start >= 25:
        return SOFT_GREEN, colors.HexColor("#2f7d4a")
    return colors.HexColor("#f2f4f7"), MUTED


def normalize_task_label(value):
    label = clean_text(value, 80)
    label = re.sub(r"^\s*(?:검사명|Task명|Task)\s*[:：]\s*", "", label, flags=re.IGNORECASE).strip()
    if re.match(r"^[A-Za-z0-9_-]+$", label):
        return label.upper()
    return label


def extract_section3_observations(text, limit=4):
    source = clean_text(text, 5000)
    if not source:
        return []

    sentences = []
    for part in re.split(r"\n+", source):
        sentences.extend([item.strip() for item in re.split(r"(?<=[.!?。])\s+", part) if item.strip()])

    observations = []
    seen = set()
    band_re = re.compile(r"p\d+\s*(?:-\s*p?\d+|이상|이하|범위)?", re.IGNORECASE)
    metric_re = re.compile(r"\b[a-z]{2}_[A-Za-z0-9_]+")

    for sentence in sentences:
        metric_matches = list(metric_re.finditer(sentence))
        if not metric_matches:
            band_match = band_re.search(sentence)
            if not band_match or "주요 관찰" in seen:
                continue
            seen.add("주요 관찰")
            observations.append(
                {
                    "label": "주요 관찰",
                    "value": "",
                    "unit": "",
                    "band": band_match.group(0).replace(" ", ""),
                    "sentence": sentence,
                }
            )
            continue

        for index, metric_match in enumerate(metric_matches):
            metric = metric_match.group(0)
            if metric in seen:
                continue
            seen.add(metric)

            next_start = metric_matches[index + 1].start() if index + 1 < len(metric_matches) else len(sentence)
            segment = sentence[metric_match.start() : next_start]
            band_match = band_re.search(segment) or band_re.search(sentence)
            value = ""
            unit = ""
            value_match = re.search(
                re.escape(metric) + r"[^.\n。]*?([-+]?\d+(?:\.\d+)?)\s*(ms|px|%)",
                segment,
                re.IGNORECASE,
            )
            if value_match:
                value = value_match.group(1)
                unit = value_match.group(2) or ""

            observations.append(
                {
                    "label": metric,
                    "value": value,
                    "unit": unit,
                    "band": band_match.group(0).replace(" ", "") if band_match else "",
                    "sentence": sentence,
                }
            )
            if len(observations) >= limit:
                return observations

    return observations


def parse_section3_feature_items(text, limit=4):
    source = clean_text(text, 8000)
    if not source:
        return []

    items = []
    current = None
    current_test = ""
    feature_re = re.compile(r"^[a-z]{2}_[A-Za-z0-9_]+$")
    value_re = re.compile(r"^([-+]?\d+(?:\.\d+)?)\s*(ms|px|%)$")
    inline_feature_re = re.compile(
        r"^([a-z]{2}_[A-Za-z0-9_]+)\s*[:：]\s*([-+]?\d+(?:\.\d+)?)\s*([A-Za-z가-힣/%°]+)?\s*(?:\(([^)]+)\))?\s*$"
    )
    position_re = re.compile(r"(상위|하위|중간|평균|p\d+|%)", re.IGNORECASE)

    for raw_line in source.split("\n"):
        stripped = raw_line.strip()
        if not stripped:
            continue

        test_match = re.search(r"(?:검사명|Task명|Task)\s*[:：]\s*([A-Za-z0-9가-힣_-]+)", stripped, re.IGNORECASE)
        if stripped.startswith("■") and test_match:
            current_test = normalize_task_label(test_match.group(1))
            continue

        bullet_match = re.match(r"^[-•]\s+(.+)$", stripped)
        if not bullet_match:
            continue

        content = bullet_match.group(1).strip()
        if re.match(r"^(수집\s*데이터|연관\s*Primitive\s*Indicator|Primitive\s*Indicator)\s*[:：]?$", content, re.IGNORECASE):
            continue
        inline_match = inline_feature_re.match(content)
        if inline_match:
            label = inline_match.group(1)
            value = inline_match.group(2)
            unit = inline_match.group(3) or ""
            position = inline_match.group(4) or ""
            description = ""
            if label and value and position:
                level = position if position.endswith("수준") else f"{position} 수준"
                description = f"{label} 값은 {value} {unit}".strip() + f"로, {level}에 해당한다."
            items.append(
                {
                    "test": current_test,
                    "label": label,
                    "value": value,
                    "unit": unit,
                    "position": position,
                    "contents": [description] if description else [],
                }
            )
            current = items[-1]
            if len(items) >= limit:
                continue
            continue
        if feature_re.match(content):
            current = {
                "test": current_test,
                "label": content,
                "value": "",
                "unit": "",
                "position": "",
                "contents": [],
            }
            items.append(current)
            if len(items) >= limit:
                continue
            continue

        if current is None:
            continue

        field_match = re.match(r"^(측정값|해석\s*표현|위치|설명)\s*[:：]\s*(.*)$", content)
        if field_match:
            field = field_match.group(1).replace(" ", "")
            value = field_match.group(2).strip()
            if field == "측정값":
                value_match = value_re.match(value)
                if value_match:
                    current["value"] = value_match.group(1)
                    current["unit"] = value_match.group(2)
                else:
                    current["contents"].append(content)
                continue
            if field in {"해석표현", "위치"}:
                current["position"] = value
                continue
            if field == "설명":
                if value:
                    current["contents"].append(value)
                continue

        value_match = value_re.match(content)
        if value_match and not current["value"]:
            current["value"] = value_match.group(1)
            current["unit"] = value_match.group(2)
            continue

        if position_re.search(content) and not current["position"]:
            current["position"] = content
            continue

        current["contents"].append(content)

    items = items[:limit]
    if items:
        return items

    fallback = []
    for observation in extract_section3_observations(source, limit=limit):
        fallback.append(
            {
                "test": "",
                "label": observation.get("label", "주요 관찰"),
                "value": observation.get("value", ""),
                "unit": observation.get("unit", ""),
                "position": observation.get("band", ""),
                "contents": [observation.get("sentence", "")],
            }
        )
    return fallback


def tidy_metric_value(value):
    if not value:
        return ""
    try:
        numeric = float(value)
        return f"{numeric:.2f}".rstrip("0").rstrip(".")
    except ValueError:
        return str(value)


def wrap_canvas_text(text, max_width, font_size, max_lines):
    source = re.sub(r"\s+", " ", clean_text(text, 3000)).strip()
    if not source:
        return []

    words = source.split(" ")
    lines = []
    current = ""

    def width(value):
        return pdfmetrics.stringWidth(value, FONT_NAME, font_size)

    for word in words:
        candidate = word if not current else f"{current} {word}"
        if width(candidate) <= max_width:
            current = candidate
            continue

        if current:
            lines.append(current)
            current = ""

        if width(word) <= max_width:
            current = word
            continue

        chunk = ""
        for char in word:
            candidate = chunk + char
            if width(candidate) <= max_width:
                chunk = candidate
            else:
                if chunk:
                    lines.append(chunk)
                chunk = char
        current = chunk

        if len(lines) >= max_lines:
            break

    if current and len(lines) < max_lines:
        lines.append(current)

    if len(lines) > max_lines:
        lines = lines[:max_lines]

    if len(lines) == max_lines and width(source) > sum(width(line) for line in lines) * 0.98:
        lines[-1] = compact_text(lines[-1], max(8, len(lines[-1]) - 1))
    return lines


class ResultsOverviewFlowable(Flowable):
    def __init__(self, metrics, section_text="", task_labels=None, panel="all"):
        super().__init__()
        self.metrics = normalize_result_metrics({"resultMetrics": metrics})
        self.section_text = clean_text(section_text, 5000)
        self.observations = extract_section3_observations(self.section_text)
        self.feature_items = parse_section3_feature_items(self.section_text)
        self.task_labels = self.collect_task_labels(task_labels)
        self.panel = panel
        self.height = 86 * mm
        self.width = 0
        self.panel_gap = 5 * mm

    def collect_task_labels(self, initial_labels=None):
        labels = []
        for raw_label in initial_labels or []:
            label = normalize_task_label(raw_label)
            if label and label not in labels:
                labels.append(label)
        for item in self.metrics:
            label = normalize_task_label(item.get("task", ""))
            if label and label not in labels:
                labels.append(label)
        for item in self.feature_items:
            label = normalize_task_label(item.get("test", ""))
            if label and label not in labels:
                labels.append(label)
        return labels

    def task_label_text(self):
        if not self.task_labels:
            return ""
        text = ", ".join(self.task_labels[:3])
        if len(self.task_labels) > 3:
            text += " ..."
        return text

    def wrap(self, avail_width, avail_height):
        self.width = avail_width
        item_count = max(1, min(4, len(self.feature_items)))
        rows = (item_count + 1) // 2
        self.summary_height = 50 * mm
        self.feature_panel_height = 14 * mm + (TASK_HEADER_HEIGHT if self.task_label_text() else 0) + rows * OBSERVATION_CELL_HEIGHT
        self.panel_gap = 5 * mm
        if self.panel == "summary":
            self.height = self.summary_height
        elif self.panel == "observation":
            self.height = self.feature_panel_height
        else:
            self.height = self.summary_height + self.feature_panel_height + self.panel_gap
        return avail_width, self.height

    def metric_display_value(self, metric):
        label = metric.get("label") or ""
        value = tidy_metric_value(metric.get("value") or "")
        unit = metric.get("unit") or ""
        if value and not unit and "오류" in label:
            unit = "개"
        return compact_text(f"{value} {unit}".strip(), 18)

    def draw_metric_gauge(self, canvas, cx, cy, radius, metric):
        label = metric.get("label") or "결과 지표"
        value = metric.get("value") or ""
        unit = metric.get("unit") or ""
        canvas.setFont(FONT_NAME, 7.4)
        canvas.setFillColor(TEXT)
        canvas.drawCentredString(cx, cy + radius + 7, compact_text(label, 18))
        canvas.setStrokeColor(colors.HexColor("#dbe8e0"))
        canvas.setLineWidth(5.2)
        canvas.circle(cx, cy, radius, stroke=1, fill=0)
        canvas.setStrokeColor(colors.HexColor("#ff4b55"))
        canvas.setLineWidth(3.6)
        canvas.arc(cx - radius, cy - radius, cx + radius, cy + radius, 85, -105)
        canvas.setFillColor(DEEP_BLUE)
        canvas.setFont(FONT_NAME, 8.8)
        canvas.drawCentredString(cx, cy - 3, compact_text(f"{value} {unit}".strip(), 16))

    def draw_metric_card(self, canvas, x, y, w, h, metric, index):
        label = metric.get("label") or f"결과 지표 {index}"
        value = metric.get("value") or ""
        unit = metric.get("unit") or ""
        band = metric.get("band") or ""
        canvas.saveState()
        canvas.setStrokeColor(LINE)
        canvas.setFillColor(colors.white)
        canvas.roundRect(x, y, w, h, 3 * mm, stroke=1, fill=1)
        canvas.setFillColor(DEEP_BLUE)
        canvas.setFont(FONT_NAME, 7.6)
        canvas.drawCentredString(x + w / 2, y + h - 11, compact_text(label, 18))
        canvas.setStrokeColor(colors.HexColor("#edf1f7"))
        canvas.setLineWidth(0.6)
        baseline = y + 13
        canvas.line(x + 5, baseline, x + w - 5, baseline)
        if value:
            canvas.setFillColor(TEXT)
            canvas.setFont(FONT_NAME, 8.5)
            canvas.drawCentredString(x + w / 2, y + h / 2 - 2, compact_text(f"{value} {unit}".strip(), 18))
        if band:
            fill = SOFT_GREEN
            text_color = colors.HexColor("#2f7d4a")
            if "90" in band:
                fill = SOFT_RED
                text_color = colors.HexColor("#bc2d3a")
            elif "75" in band:
                fill = colors.HexColor("#eef2ff")
                text_color = DEEP_BLUE
            canvas.setFillColor(fill)
            canvas.setStrokeColor(fill)
            canvas.roundRect(x + 6, y + 4, w - 12, 8, 2 * mm, stroke=0, fill=1)
            canvas.setFillColor(text_color)
            canvas.setFont(FONT_NAME, 7.2)
            canvas.drawCentredString(x + w / 2, y + 6.2, compact_text(band, 14))
        canvas.restoreState()

    def draw_observation_row(self, canvas, x, y, w, observation):
        label = compact_text(observation.get("label") or "주요 관찰", 31)
        band = observation.get("band") or ""
        value = " ".join([tidy_metric_value(observation.get("value", "")), observation.get("unit", "")]).strip()
        fill, text_color = band_color(band)
        start, end = band_range_from_text(band)
        axis_x = x + 41 * mm
        axis_w = w - 69 * mm
        axis_y = y + 3.8 * mm

        canvas.setFillColor(TEXT)
        canvas.setFont(FONT_NAME, 6.2)
        canvas.drawString(x, y + 1.9 * mm, label)

        canvas.setStrokeColor(colors.HexColor("#dfe5ef"))
        canvas.setLineWidth(1.2)
        canvas.line(axis_x, axis_y, axis_x + axis_w, axis_y)
        for tick, tick_label in [(25, "p25"), (50, ""), (75, "p75"), (90, "p90")]:
            tx = axis_x + axis_w * tick / 100
            canvas.setStrokeColor(colors.HexColor("#dfe5ef"))
            canvas.setLineWidth(0.6)
            canvas.line(tx, axis_y - 2, tx, axis_y + 2)
            if tick_label:
                canvas.setFillColor(MUTED)
                canvas.setFont(FONT_NAME, 5.4)
                canvas.drawCentredString(tx, axis_y - 8, tick_label)

        sx = axis_x + axis_w * start / 100
        ex = axis_x + axis_w * end / 100
        canvas.setFillColor(fill)
        canvas.roundRect(sx, axis_y - 3, max(6, ex - sx), 6, 3, stroke=0, fill=1)
        canvas.setFillColor(text_color)
        canvas.setFont(FONT_NAME, 6.4)
        badge = band or "관찰"
        if value:
            badge = f"{value} {badge}"
        canvas.drawRightString(x + w, y + 1.9 * mm, compact_text(badge, 17))

    def draw_feature_card(self, canvas, x, y, w, h, item, draw_box=True):
        label = item.get("label") or "주요 관찰"
        value = " ".join([tidy_metric_value(item.get("value", "")), item.get("unit", "")]).strip()
        position = item.get("position", "")
        start, end = band_range_from_text(position)

        canvas.saveState()
        if draw_box:
            canvas.setStrokeColor(LINE)
            canvas.setFillColor(colors.white)
            canvas.roundRect(x, y, w, h, 2.5 * mm, stroke=1, fill=1)

        canvas.setFillColor(DEEP_BLUE)
        canvas.setFont(ACTIVE_BOLD_FONT_NAME, TABLE_LABEL_FONT_SIZE)
        canvas.drawString(x + 3 * mm, y + h - 5.8 * mm, label)

        axis_y = y + h - 13 * mm
        badge_w = 25 * mm
        badge_h = 5.5 * mm
        badge_gap = 4 * mm
        if value:
            badge_x = x + 3 * mm
            badge_y = axis_y - badge_h / 2
            badge_font_size = 8.8
            badge_text_y = centered_text_baseline(FONT_NAME, badge_font_size, badge_y + badge_h / 2)

            canvas.setFillColor(colors.HexColor("#eef2ff"))
            canvas.roundRect(badge_x, badge_y, badge_w, badge_h, 1.6 * mm, stroke=0, fill=1)
            canvas.setFillColor(DEEP_BLUE)
            canvas.setFont(ACTIVE_BOLD_FONT_NAME, badge_font_size)
            canvas.drawCentredString(badge_x + badge_w / 2, badge_text_y, compact_text(value, 16))
            axis_x = badge_x + badge_w + badge_gap
        else:
            axis_x = x + 3 * mm
        axis_w = x + w - 4 * mm - axis_x
        canvas.setStrokeColor(colors.HexColor("#dfe5ef"))
        canvas.setLineWidth(1.2)
        canvas.line(axis_x, axis_y, axis_x + axis_w, axis_y)
        for tick, tick_label in [(10, "p10"), (25, "p25"), (75, "p75"), (90, "p90")]:
            tx = axis_x + axis_w * tick / 100
            canvas.setStrokeColor(colors.HexColor("#dfe5ef"))
            canvas.setLineWidth(0.5)
            canvas.line(tx, axis_y - 3, tx, axis_y + 3)
            if tick_label:
                canvas.setFillColor(MUTED)
                canvas.setFont(FONT_NAME, 8)
                canvas.drawCentredString(tx, axis_y - 8, tick_label)

        sx = axis_x + axis_w * start / 100
        ex = axis_x + axis_w * end / 100
        canvas.setFillColor(SOFT_RED)
        canvas.roundRect(
            sx,
            axis_y - GRAPH_BAND_THICKNESS / 2,
            max(8, ex - sx),
            GRAPH_BAND_THICKNESS,
            GRAPH_BAND_THICKNESS / 2,
            stroke=0,
            fill=1,
        )

        contents = [content for content in item.get("contents", []) if content]
        content_text = " ".join(contents[:2])
        lines = wrap_canvas_text(
            content_text,
            w - 6 * mm,
            FEATURE_BODY_FONT_SIZE,
            max(2, int((h - 20 * mm) / FEATURE_BODY_LINE_HEIGHT)),
        )
        line_y = y + h - 23 * mm
        canvas.setFillColor(TEXT)
        canvas.setFont(FONT_NAME, FEATURE_BODY_FONT_SIZE)
        for line in lines:
            if line_y < y + 3 * mm:
                break
            canvas.drawString(x + 3 * mm, line_y, line)
            line_y -= FEATURE_BODY_LINE_HEIGHT
        canvas.restoreState()

    def draw_task_band(self, canvas, x, y, w, h, text):
        if not text:
            return
        canvas.setFillColor(SOFT_BLUE)
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.8)
        canvas.rect(x, y, w, h, stroke=1, fill=1)
        canvas.setFillColor(DEEP_BLUE)
        canvas.setFont(ACTIVE_BOLD_FONT_NAME, TABLE_TASK_HEADER_FONT_SIZE)
        canvas.drawCentredString(
            x + w / 2,
            centered_text_baseline(ACTIVE_BOLD_FONT_NAME, TABLE_TASK_HEADER_FONT_SIZE, y + h / 2),
            compact_text(text, 32),
        )

    def draw_metric_summary_panel(self, canvas, x, y, w, h):
        canvas.saveState()
        canvas.setStrokeColor(LINE)
        canvas.setFillColor(colors.white)
        canvas.roundRect(x, y, w, h, 3 * mm, stroke=1, fill=1)

        canvas.setFillColor(TEXT)
        canvas.setFont(ACTIVE_BOLD_FONT_NAME, 11)
        canvas.drawString(x + 4 * mm, y + h - 7 * mm, "검사 결과 지표")
        task_text = self.task_label_text()
        canvas.setFillColor(MUTED)
        canvas.setFont(FONT_NAME, 6.7)
        # canvas.drawString(x + 4 * mm, y + h - 11 * mm, "서버 연동 전까지 값은 비워 두고, 지표 위치만 자리로 확보합니다.")

        table_x = x + 4 * mm
        table_w = w - 8 * mm
        table_y = y + 4 * mm
        task_h = TASK_HEADER_HEIGHT if task_text else 0
        header_h = METRIC_ROW_HEIGHT
        value_h = METRIC_ROW_HEIGHT
        performance_h = METRIC_ROW_HEIGHT
        table_h = task_h + header_h + value_h + performance_h
        col_w = table_w / 4

        canvas.setStrokeColor(LINE)
        canvas.setFillColor(colors.white)
        canvas.rect(table_x, table_y, table_w, table_h, stroke=1, fill=1)
        if task_text:
            self.draw_task_band(
                canvas,
                table_x,
                table_y + performance_h + value_h + header_h,
                table_w,
                task_h,
                task_text,
            )
        canvas.setFillColor(colors.HexColor("#fbfcff"))
        canvas.rect(table_x, table_y + performance_h + value_h, table_w, header_h, stroke=0, fill=1)

        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.6)
        canvas.line(table_x, table_y + performance_h, table_x + table_w, table_y + performance_h)
        canvas.line(table_x, table_y + performance_h + value_h, table_x + table_w, table_y + performance_h + value_h)
        if task_text:
            canvas.line(
                table_x,
                table_y + performance_h + value_h + header_h,
                table_x + table_w,
                table_y + performance_h + value_h + header_h,
            )
        for index in range(1, 4):
            vx = table_x + col_w * index
            canvas.line(vx, table_y, vx, table_y + performance_h + value_h + header_h)

        for index, metric in enumerate(self.metrics[:4]):
            cx = table_x + col_w * (index + 0.5)
            label = compact_text(metric.get("label") or f"결과 지표 {index + 1}", 18)
            value = self.metric_display_value(metric) or " "
            performance_label = compact_text(metric.get("performanceLabel") or " ", 18)

            canvas.setFillColor(DEEP_BLUE)
            canvas.setFont(ACTIVE_BOLD_FONT_NAME, TABLE_LABEL_FONT_SIZE)
            canvas.drawCentredString(
                cx,
                centered_text_baseline(
                    ACTIVE_BOLD_FONT_NAME,
                    TABLE_LABEL_FONT_SIZE,
                    table_y + performance_h + value_h + header_h / 2,
                ),
                label,
            )

            canvas.setFillColor(TEXT)
            canvas.setFont(FONT_NAME, 10)
            canvas.drawCentredString(
                cx,
                centered_text_baseline(FONT_NAME, 10, table_y + performance_h + value_h / 2),
                value,
            )

            canvas.setFillColor(MUTED)
            canvas.setFont(FONT_NAME, 10)
            canvas.drawCentredString(
                cx,
                centered_text_baseline(FONT_NAME, 8.6, table_y + performance_h / 2),
                performance_label,
            )
        canvas.setStrokeColor(LINE)
        canvas.rect(table_x, table_y, table_w, table_h, stroke=1, fill=0)
        canvas.restoreState()

    def draw_observation_panel(self, canvas, x, y, w, h):
        canvas.saveState()
        canvas.setStrokeColor(LINE)
        canvas.setFillColor(colors.white)
        canvas.roundRect(x, y, w, h, 3 * mm, stroke=1, fill=1)

        canvas.setFillColor(TEXT)
        canvas.setFont(ACTIVE_BOLD_FONT_NAME, 11)
        canvas.drawString(x + 4 * mm, y + h - 7 * mm, "연관 Primitive Indicator")
        task_text = self.task_label_text()
        canvas.setFillColor(MUTED)
        canvas.setFont(FONT_NAME, 6.7)
        # canvas.drawString(x + 4 * mm, y + h - 11 * mm, "feature, 값, 위치, 해석 문장을 모델 응답에서 분리해 표시합니다.")

        items = self.feature_items[:4]
        if items:
            content_x = x + 4 * mm
            content_w = w - 8 * mm
            table_y = y + 4 * mm
            table_top = y + h - 10 * mm
            task_header_h = TASK_HEADER_HEIGHT if task_text else 0
            rows = (len(items) + 1) // 2
            rows = max(1, rows)
            grid_h = rows * OBSERVATION_CELL_HEIGHT
            table_h = task_header_h + grid_h
            table_y = table_top - table_h
            grid_h = table_h - task_header_h
            cell_w = content_w / 2
            cell_h = OBSERVATION_CELL_HEIGHT

            canvas.setStrokeColor(LINE)
            canvas.setFillColor(colors.white)
            canvas.rect(content_x, table_y, content_w, table_h, stroke=1, fill=1)
            if task_text:
                self.draw_task_band(canvas, content_x, table_y + grid_h, content_w, task_header_h, task_text)

            grid_y = table_y
            canvas.setStrokeColor(LINE)
            canvas.setLineWidth(0.6)
            canvas.line(content_x + cell_w, grid_y, content_x + cell_w, grid_y + grid_h)
            for row in range(1, rows):
                y_line = grid_y + cell_h * row
                canvas.line(content_x, y_line, content_x + content_w, y_line)

            for index, item in enumerate(items):
                row = index // 2
                col = index % 2
                card_x = content_x + col * cell_w
                card_y = grid_y + (rows - row - 1) * cell_h
                self.draw_feature_card(canvas, card_x, card_y, cell_w, cell_h, item, draw_box=False)
        else:
            graph_top = y + h - 20 * mm
            canvas.setFillColor(colors.HexColor("#f7f9fc"))
            canvas.roundRect(x + 4 * mm, graph_top - 8 * mm, w - 8 * mm, 14 * mm, 2 * mm, stroke=0, fill=1)
            canvas.setFillColor(MUTED)
            canvas.setFont(FONT_NAME, 7)
            canvas.drawString(x + 7 * mm, graph_top - 1 * mm, "모델 응답의 [3] 내용이 들어오면 그래프로 표시됩니다.")
        canvas.restoreState()

    def draw(self):
        canvas = self.canv
        w = self.width
        h = self.height
        canvas.saveState()
        panel_x = 0
        panel_w = w
        if self.panel == "summary":
            self.draw_metric_summary_panel(canvas, panel_x, 0, panel_w, self.summary_height)
            canvas.restoreState()
            return
        if self.panel == "observation":
            self.draw_observation_panel(canvas, panel_x, 0, panel_w, self.feature_panel_height)
            canvas.restoreState()
            return

        summary_y = h - self.summary_height
        self.draw_metric_summary_panel(canvas, panel_x, summary_y, panel_w, self.summary_height)

        feature_y = 0
        self.draw_observation_panel(canvas, panel_x, feature_y, panel_w, summary_y - self.panel_gap)
        canvas.restoreState()


def parse_report_sections(answer):
    sections = {"_intro": []}
    titles = {}
    current = "_intro"
    heading_re = re.compile(r"^\s*\[\s*(\d+)\s*[.)]\s*([^\]]+?)\s*\]\s*(.*)$")

    for raw_line in clean_text(answer).split("\n"):
        match = heading_re.match(raw_line)
        if match:
            current = match.group(1)
            titles[current] = match.group(2).strip()
            sections.setdefault(current, [])
            rest = match.group(3).strip()
            if rest:
                sections[current].append(rest)
            continue
        sections.setdefault(current, []).append(raw_line)

    return {key: "\n".join(value).strip() for key, value in sections.items()}, titles


def body_flowables(text, styles, empty_text=""):
    flows = []
    stripped = clean_text(text)
    if not stripped:
        if empty_text:
            flows.append(paragraph(empty_text, styles["note"]))
        return flows

    for raw_line in stripped.split("\n"):
        line = raw_line.strip()
        if not line:
            flows.append(Spacer(1, 2.5 * mm))
            continue
        if line.startswith("■"):
            flows.append(paragraph(line, styles["subsection"]))
            continue
        if re.match(r"^[-•]\s+", line):
            flows.append(paragraph(f"- {line[1:].strip()}", styles["bullet"]))
            continue
        flows.append(paragraph(line, styles["body"]))
    return flows


def format_date_yyyy_mm_dd(value):
    text = clean_text(value, 80)
    if not text:
        return ""

    for date_format in ("%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d", "%m-%d-%Y", "%m/%d/%Y", "%m.%d.%Y"):
        try:
            return datetime.strptime(text, date_format).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return text


def normalize_student_info(payload):
    raw = payload.get("studentInfo") if isinstance(payload.get("studentInfo"), dict) else {}
    return {
        "registrationNo": clean_text(raw.get("registrationNo") or raw.get("user_name", ""), 80),
        "name": clean_text(raw.get("name") or raw.get("Initial", ""), 80),
        "gender": clean_text(raw.get("gender") or raw.get("sex", ""), 40),
        "age": clean_text(raw.get("age") or raw.get("age_years", ""), 40),
        "education": clean_text(raw.get("education", ""), 80),
        "birthDate": clean_text(raw.get("birthDate", ""), 80),
        "physician": clean_text(raw.get("physician", ""), 80),
        "evaluationDate": format_date_yyyy_mm_dd(raw.get("evaluationDate") or raw.get("session_date", "")),
    }


def normalize_result_metrics(payload):
    raw = payload.get("resultMetrics") if isinstance(payload.get("resultMetrics"), list) else []
    defaults = [
        {"task": "", "label": "누락오류", "value": "", "unit": "", "band": "", "performanceLabel": ""},
        {"task": "", "label": "오경보오류", "value": "", "unit": "", "band": "", "performanceLabel": ""},
        {"task": "", "label": "반응시간 평균", "value": "", "unit": "ms", "band": "", "performanceLabel": ""},
        {"task": "", "label": "반응시간 표준편차", "value": "", "unit": "ms", "band": "", "performanceLabel": ""},
    ]
    metrics = []
    for index in range(4):
        item = raw[index] if index < len(raw) and isinstance(raw[index], dict) else {}
        base = defaults[index].copy()
        base.update(
            {
                "task": normalize_task_label(item.get("task", base["task"])),
                "label": clean_text(item.get("label", base["label"]), 80),
                "value": clean_text(item.get("value", base["value"]), 80),
                "unit": clean_text(item.get("unit", base["unit"]), 40),
                "band": clean_text(item.get("band", base["band"]), 80),
                "performanceLabel": clean_text(item.get("performanceLabel", base.get("performanceLabel", "")), 80),
            }
        )
        metrics.append(base)
    return metrics


def parse_section3_result_metrics(text):
    source = clean_text(text, 8000)
    if not source:
        return []

    metric_order = ["누락오류", "오경보오류", "반응시간 평균", "반응시간 표준편차"]
    metric_by_label = {}
    current_task = ""
    metric_re = re.compile(
        r"^(누락오류|오경보오류|반응시간\s*평균|반응시간\s*표준편차)\s*[:：]\s*"
        r"([-+]?\d+(?:\.\d+)?)\s*([A-Za-z가-힣/%°]+)?\s*(?:\(([^)]+)\))?\s*$"
    )

    for raw_line in source.split("\n"):
        stripped = raw_line.strip()
        if not stripped:
            continue

        task_match = re.search(r"(?:검사명|Task명|Task)\s*[:：]\s*([A-Za-z0-9가-힣_-]+)", stripped, re.IGNORECASE)
        if stripped.startswith("■") and task_match:
            current_task = normalize_task_label(task_match.group(1))
            continue

        bullet_match = re.match(r"^[-•]\s+(.+)$", stripped)
        if not bullet_match:
            continue

        content = bullet_match.group(1).strip()
        metric_match = metric_re.match(content)
        if not metric_match:
            continue

        label = re.sub(r"\s+", " ", metric_match.group(1)).strip()
        value = metric_match.group(2) or ""
        unit = metric_match.group(3) or ""
        performance_label = metric_match.group(4) or ""
        metric_by_label[label] = {
            "task": current_task,
            "label": label,
            "value": value,
            "unit": unit,
            "band": "",
            "performanceLabel": performance_label,
        }

    return [metric_by_label[label] for label in metric_order if label in metric_by_label]


def build_student_info_card(payload, styles, width):
    info = normalize_student_info(payload)
    data = [
        [
            "",
            [paragraph("환아 ID", styles["label"]), paragraph(info["registrationNo"] or " ", styles["value"])],
            [paragraph("성별", styles["label"]), paragraph(info["gender"] or " ", styles["value"])],
            [paragraph("나이", styles["label"]), paragraph(info["age"] or " ", styles["value"])],
            [paragraph("평가일자", styles["label"]), paragraph(info["evaluationDate"] or " ", styles["value"])],
        ],
    ]

    inner_width = width
    left_bar_width = 2.2 * mm
    content_width = inner_width - left_bar_width
    table = Table(
        data,
        colWidths=[
            left_bar_width,
            content_width * 0.32,
            content_width * 0.18,
            content_width * 0.18,
            content_width * 0.32,
        ],
        rowHeights=[18 * mm],
        hAlign="LEFT",
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                ("BACKGROUND", (0, 0), (0, -1), NAVY),
                ("LINEABOVE", (0, 0), (-1, -1), 0.8, LINE),
                ("LINEBELOW", (0, 0), (-1, -1), 0.8, LINE),
                ("LINEAFTER", (0, 0), (-2, -1), 0.6, LINE),
                ("LINEAFTER", (-1, 0), (-1, -1), 0.8, LINE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 9),
                ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (0, -1), 0),
                ("RIGHTPADDING", (0, 0), (0, -1), 0),
            ]
        )
    )
    wrapper = Table(
        [[table], [Spacer(1, 7 * mm)]],
        colWidths=[width],
        hAlign="LEFT",
    )
    wrapper.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                ("LINEBELOW", (0, 1), (0, 1), 1.4, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return wrapper


def parse_exam_groups(section_text):
    groups = []
    current = None
    in_collected_data = False
    for raw_line in clean_text(section_text).split("\n"):
        line = raw_line.strip()
        if not line:
            continue
        match = re.search(r"(?:검사명|Task명|Task)\s*[:：]\s*([A-Za-z0-9가-힣_-]+)", line, re.IGNORECASE)
        if line.startswith("■") and match:
            current = {"name": normalize_task_label(match.group(1)), "definition": "", "indicators": []}
            groups.append(current)
            in_collected_data = False
            continue
        if re.match(r"^[-•]\s+", line):
            item = line[1:].strip()
            if current is None:
                current = {"name": "사용 데이터", "definition": "", "indicators": []}
                groups.append(current)

            field_match = re.match(r"^(정의|수집\s*데이터)\s*[:：]\s*(.*)$", item)
            if field_match:
                field = field_match.group(1).replace(" ", "")
                value = field_match.group(2).strip()
                if field == "정의":
                    current["definition"] = value
                    in_collected_data = False
                else:
                    in_collected_data = True
                continue

            continue
    return groups


def bullet_list(items, styles):
    if not items:
        return paragraph("제공되지 않음", styles["body"])
    return [Paragraph(f"- {escape(str(item))}", styles["bullet"]) for item in items]


def build_exam_card(group, width, styles):
    name = clean_text(group.get("name", "검사"), 80) or "검사"
    name = normalize_task_label(name) or "검사"
    definition = clean_text(group.get("definition", ""), 500) or "제공되지 않음"

    rows = [[paragraph(name, styles["exam_title"]), ""]]
    row_styles = [
        ("SPAN", (0, 0), (1, 0)),
        ("BACKGROUND", (0, 0), (1, 0), SOFT_BLUE),
        ("LINEBELOW", (0, 0), (1, 0), 0.7, LINE),
    ]

    rows.append([paragraph("정의", styles["exam_label"]), paragraph(definition, styles["body"])])

    table = Table(
        rows,
        colWidths=[width * 0.28, width * 0.72],
        rowHeights=[TASK_HEADER_HEIGHT] + [None] * (len(rows) - 1),
        hAlign="LEFT",
    )
    table.setStyle(
        TableStyle(
            row_styles
            + [
                ("BOX", (0, 0), (-1, -1), 0.8, LINE),
                ("INNERGRID", (0, 1), (-1, -1), 0.5, LINE),
                ("BACKGROUND", (0, 1), (0, -1), colors.HexColor("#fbfcff")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, 0), 4),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 4),
            ]
        )
    )
    return table


def build_exam_grid(section_text, styles, width):
    groups = parse_exam_groups(section_text)
    if not groups:
        groups = [{"name": "검사", "definition": clean_text(section_text, 500), "indicators": []}]

    rows = [[build_exam_card(group, width, styles)] for group in groups]

    grid = Table(rows, colWidths=[width], hAlign="LEFT")
    grid.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return grid


def append_text_section(story, number, title, text, styles, empty_text="", trailing_space=5 * mm):
    flows = body_flowables(text, styles, empty_text=empty_text)
    if flows:
        story.append(KeepTogether([SectionHeader(number, title), Spacer(1, 2 * mm), flows[0]]))
        story.extend(flows[1:])
    else:
        story.append(SectionHeader(number, title))
        story.append(Spacer(1, 1 * mm))
    if trailing_space:
        story.append(Spacer(1, trailing_space))


def draw_page_factory(title):
    def draw_page(canvas, doc):
        canvas.saveState()
        if doc.page == 1:
            canvas.setFillColor(NAVY)
            canvas.rect(0, PAGE_HEIGHT - 29 * mm, PAGE_WIDTH, 29 * mm, stroke=0, fill=1)
            draw_synthetic_bold_text(
                canvas,
                PAGE_WIDTH / 2,
                PAGE_HEIGHT - 18 * mm,
                title,
                TITLE_FONT_SIZE,
                colors.white,
                align="center",
                stroke_width=0.24,
            )
        else:
            draw_synthetic_bold_text(
                canvas,
                doc.leftMargin,
                PAGE_HEIGHT - 14 * mm,
                title,
                9,
                NAVY,
                stroke_width=0.16,
            )
            canvas.setStrokeColor(LINE)
            canvas.line(doc.leftMargin, PAGE_HEIGHT - 17 * mm, PAGE_WIDTH - doc.rightMargin, PAGE_HEIGHT - 17 * mm)
        canvas.setFillColor(MUTED)
        canvas.setFont(FONT_NAME, 8)
        canvas.drawRightString(PAGE_WIDTH - doc.rightMargin, 10 * mm, str(doc.page))
        canvas.restoreState()

    return draw_page


def build_pdf(payload):
    register_korean_font()
    styles = make_styles()
    buffer = BytesIO()
    title = clean_text(payload.get("title", ""), 200) or REPORT_TITLE
    if title == "주의 집중력 관련 양상 분석 보고서":
        title = REPORT_TITLE

    left_margin = 14 * mm
    right_margin = 14 * mm
    first_page_top_margin = 38 * mm
    later_page_top_margin = 20 * mm
    bottom_margin = 18 * mm

    doc = BaseDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=left_margin,
        rightMargin=right_margin,
        topMargin=first_page_top_margin,
        bottomMargin=bottom_margin,
        title=title,
        author="localLLMChat",
    )
    doc.addPageTemplates(
        [
            PageTemplate(
                id="first",
                frames=[
                    Frame(
                        left_margin,
                        bottom_margin,
                        PAGE_WIDTH - left_margin - right_margin,
                        PAGE_HEIGHT - first_page_top_margin - bottom_margin,
                        id="first_frame",
                        leftPadding=0,
                        rightPadding=0,
                    )
                ],
                onPage=draw_page_factory(title),
                autoNextPageTemplate="later",
            ),
            PageTemplate(
                id="later",
                frames=[
                    Frame(
                        left_margin,
                        bottom_margin,
                        PAGE_WIDTH - left_margin - right_margin,
                        PAGE_HEIGHT - later_page_top_margin - bottom_margin,
                        id="later_frame",
                        leftPadding=0,
                        rightPadding=0,
                    )
                ],
                onPage=draw_page_factory(title),
            ),
        ]
    )

    answer = clean_text(payload.get("answer", ""))
    sections, _titles = parse_report_sections(answer)
    section2_text = sections.get("2", "")
    section2_task_labels = [group.get("name", "") for group in parse_exam_groups(section2_text)]
    section3_text = sections.get("3", "")
    metrics = parse_section3_result_metrics(section3_text) or normalize_result_metrics(payload)
    intro = sections.get("_intro", "")

    story = [
        build_student_info_card(payload, styles, doc.width),
        Spacer(1, 10 * mm),
    ]

    append_text_section(
        story,
        1,
        "개요",
        sections.get("1", ""),
        styles,
        empty_text="<1. 개요>에 해당하는 내용",
    )

    story.append(SectionHeader(2, "보고서의 근거가 되는 Task"))
    story.append(Spacer(1, 2 * mm))
    story.append(build_exam_grid(section2_text, styles, doc.width))
    story.append(Spacer(1, 5 * mm))

    story.append(
        KeepTogether(
            [
                SectionHeader(3, "검사 결과 지표 및 연관 Primitive Indicator"),
                Spacer(1, 2 * mm),
                ResultsOverviewFlowable(metrics, section3_text, section2_task_labels, panel="summary"),
            ]
        )
    )
    story.append(Spacer(1, 5 * mm))
    story.append(ResultsOverviewFlowable(metrics, section3_text, section2_task_labels, panel="observation"))
    story.append(Spacer(1, 5 * mm))

    append_text_section(
        story,
        4,
        "센서 데이터 해석 및 임상적 시사점",
        sections.get("4", ""),
        styles,
        empty_text="<4. 센서 데이터 해석 및 임상적 시사점>에 해당하는 내용",
    )
    append_text_section(
        story,
        5,
        "DSM-5 진단 기준 확인 사항",
        sections.get("5", ""),
        styles,
        empty_text="<5. DSM-5 진단 기준 확인 사항>에 해당하는 내용",
        trailing_space=5 * mm if intro else 0,
    )

    if intro:
        story.append(paragraph("기타 모델 응답", styles["subsection"]))
        story.extend(body_flowables(intro, styles))
        story.append(Spacer(1, 4 * mm))

    # story.append(paragraph("참고: 본 문서는 임상적 판단을 보조하기 위한 생성형 AI 기반 초안입니다.", styles["note"]))

    doc.build(story)
    return buffer.getvalue()


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    pdf_bytes = build_pdf(payload)
    sys.stdout.buffer.write(pdf_bytes)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
