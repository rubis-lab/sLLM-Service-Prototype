#!/usr/bin/env python3
"""
Build task-level PI/result summary files for the 50-client cohort.

Inputs:
  - cohort CSV with client metadata
  - primitive indicator JSONs:
      {pi_root}/{client_id}/{task}/eye-tracking_pi_2_2.json
  - task result summaries:
      {task_result_root}/{client_id}/result.json

Outputs:
  - {output_dir}/{task}/{task}_summary.csv
  - {output_dir}/{task}/{task}_summary.json
"""

from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_PREPROCESSING_DIR = PROJECT_ROOT / "data_preprocessing"
DEFAULT_COHORT_CSV = DATA_PREPROCESSING_DIR / "clients_metadata.csv"
DEFAULT_PI_ROOT = DATA_PREPROCESSING_DIR / "primitive_indicator"
DEFAULT_TASK_RESULT_ROOT = DATA_PREPROCESSING_DIR / "task_results"
DEFAULT_OUTPUT_DIR = DATA_PREPROCESSING_DIR / "summary"
DEFAULT_PI_FILENAME = "eye-tracking_pi_2_2.json"

META_COLUMNS = ["user_name", "group_label", "sex", "age_years", "session_date", "Initial", "client_id"]

TASK_FEATURES: Dict[str, List[Dict[str, str]]] = {
    "vst": [
        {"name": "et_first_fixation_duration_mean", "source": "et_first_fixation_duration_mean", "unit": "ms"},
        {"name": "et_fixation_duration_mean", "source": "et_fixation_duration_mean", "unit": "ms"},
        {"name": "et_fixation_duration_std", "source": "et_fixation_duration_std", "unit": "ms"},
        {
            "name": "et_fixation_dispersion_mean",
            "source": "et_rms-based_fixation_dispersion_mean",
            "source_fallback": "et_rms_based_fixation_dispersion_mean",
            "unit": "px",
        },
    ],
    "gng": [
        {"name": "et_saccade_rate_mean", "source": "et_saccade_rate_mean", "unit": "count/sec"},
        {"name": "et_saccade_direction_mean", "source": "et_saccade_direction_mean", "unit": "rad"},
        {"name": "et_gaze_offset_to_screen_center_mean", "source": "et_gaze_offset_to_screen_center_mean", "unit": "px"},
    ],
    "flanker": [
        {"name": "et_first_fixation_latency_mean", "source": "et_first_fixation_latency_mean", "unit": "ms"},
        {"name": "et_aoi_non_aoi_transition_count", "source": "et_aoi_non_aoi_transition_count", "unit": "count"},
        {"name": "et_aoi_dwell_time_mean", "source": "et_aoi_dwell_time_mean", "unit": "ms"},
    ],
}

RESULT_METRICS = [
    ("누락오류", "numOmissionErrors"),
    ("오경보오류", "numCommissionErrors"),
    ("반응시간 평균", "meanResponseTime"),
    ("반응시간 표준편차", "stdResponseTime"),
]


def read_cohort(path: Path) -> List[Dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows = []
        for row in reader:
            rows.append({col: (row.get(col) or "") for col in META_COLUMNS})
    return rows


def to_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(out):
        return None
    return out


def round_value(value: Optional[float], digits: int = 6) -> Optional[float]:
    if value is None:
        return None
    return round(float(value), digits)


def load_pi_summary(pi_path: Path, source_pi_names: List[str]) -> Dict[str, Any]:
    if not pi_path.exists():
        return {
            "value": None,
            "window_count": 0,
            "valid_window_count": 0,
            "missing_window_count": 0,
        }

    with pi_path.open("r", encoding="utf-8") as f:
        obj = json.load(f)

    windows = obj.get("windows", [])
    if not isinstance(windows, list):
        windows = []

    values: List[float] = []
    for window in windows:
        pi = window.get("pi", {}) if isinstance(window, dict) else {}
        val = None
        for source_pi_name in source_pi_names:
            val = to_float(pi.get(source_pi_name))
            if val is not None:
                break
        if val is not None:
            values.append(val)

    window_count = len(windows)
    valid_count = len(values)
    missing_count = max(window_count - valid_count, 0)
    mean_value = sum(values) / valid_count if valid_count > 0 else None
    return {
        "value": round_value(mean_value),
        "window_count": window_count,
        "valid_window_count": valid_count,
        "missing_window_count": missing_count,
    }


def load_result_summary(result_path: Path, task: str) -> Dict[str, Optional[float]]:
    if not result_path.exists():
        return {label: None for label, _key in RESULT_METRICS}
    with result_path.open("r", encoding="utf-8") as f:
        obj = json.load(f)
    task_obj = obj.get(task, {}) if isinstance(obj, dict) else {}
    meta = task_obj.get("meta", {}) if isinstance(task_obj, dict) else {}
    return {label: to_float(meta.get(meta_key)) for label, meta_key in RESULT_METRICS}


def percentile_ranks(values: Dict[str, Optional[float]], *, higher_is_better: bool) -> Dict[str, Optional[float]]:
    """Return favorable inclusive percentile ranks.

    Ties receive the best rank available within the tied value group. For
    example, if lower-is-better omission errors are 0 for many clients, every
    client with 0 errors receives the top percentile instead of the average
    tied rank.
    """
    valid = [(cid, val) for cid, val in values.items() if val is not None]
    n = len(valid)
    if n == 0:
        return {cid: None for cid in values}

    sorted_vals = sorted(valid, key=lambda item: item[1])
    ranks: Dict[str, float] = {}
    i = 0
    while i < n:
        j = i + 1
        while j < n and sorted_vals[j][1] == sorted_vals[i][1]:
            j += 1
        if higher_is_better:
            percentile = j / n * 100.0
        else:
            percentile = (n - i) / n * 100.0
        for k in range(i, j):
            ranks[sorted_vals[k][0]] = round(percentile, 1)
        i = j

    return {cid: ranks.get(cid) for cid in values}


def percentile_band(percentile: Optional[float]) -> Optional[str]:
    if percentile is None:
        return None
    if percentile < 10:
        return "p10 미만"
    if percentile < 25:
        return "p10-p25"
    if percentile <= 75:
        return "p25-p75"
    if percentile < 90:
        return "p75-p90"
    return "p90 이상"


def position_label_ko(percentile: Optional[float]) -> Optional[str]:
    if percentile is None:
        return None
    if percentile < 10:
        return "하위 10% 수준"
    if percentile < 25:
        return "하위 10~25% 수준"
    if percentile <= 75:
        return "중간 50% 수준"
    if percentile < 90:
        return "상위 10~25% 수준"
    return "상위 10% 수준"


def performance_label(percentile: Optional[float]) -> Optional[str]:
    if percentile is None:
        return None
    if percentile >= 50:
        top = min(99, max(1, int(round(100.0 - percentile))))
        return f"상위 {top}%"
    lower = min(99, max(1, int(round(percentile))))
    return f"하위 {lower}%"


def build_task_rows(
    task: str,
    cohort_rows: List[Dict[str, str]],
    pi_root: Path,
    task_result_root: Path,
    pi_filename: str,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    features = TASK_FEATURES[task]
    rows: List[Dict[str, Any]] = []
    feature_values: Dict[str, Dict[str, Optional[float]]] = {feat["name"]: {} for feat in features}
    result_values: Dict[str, Dict[str, Optional[float]]] = {label: {} for label, _key in RESULT_METRICS}

    for meta in cohort_rows:
        client_id = meta["client_id"]
        pi_path = pi_root / client_id / task / pi_filename
        result_path = task_result_root / client_id / "result.json"
        row: Dict[str, Any] = {col: meta.get(col, "") for col in META_COLUMNS}
        row["pi_file"] = str(pi_path)

        first_window_count: Optional[int] = None
        feature_json: Dict[str, Dict[str, Any]] = {}
        for feat in features:
            source_names = [feat["source"]]
            if feat.get("source_fallback"):
                source_names.append(feat["source_fallback"])
            summary = load_pi_summary(pi_path, source_names)
            if first_window_count is None:
                first_window_count = int(summary["window_count"])
            name = feat["name"]
            row[f"{name}_value"] = summary["value"]
            row[f"{name}_unit"] = feat["unit"]
            row[f"{name}_source_pi_name"] = feat["source"]
            row[f"{name}_valid_window_count"] = summary["valid_window_count"]
            row[f"{name}_missing_window_count"] = summary["missing_window_count"]
            feature_values[name][client_id] = summary["value"]
            feature_json[name] = {
                "source_pi_name": feat["source"],
                "unit": feat["unit"],
                "value": summary["value"],
                "aggregation": "mean_over_numeric_non_null_windows",
                "valid_window_count": summary["valid_window_count"],
                "missing_window_count": summary["missing_window_count"],
            }

        row["window_count"] = first_window_count or 0
        row["_features_json"] = feature_json

        result_summary = load_result_summary(result_path, task)
        row["_result_path"] = str(result_path)
        for label, _meta_key in RESULT_METRICS:
            val = result_summary[label]
            row[label] = round_value(val)
            result_values[label][client_id] = val

        rows.append(row)

    for feat in features:
        name = feat["name"]
        ranks = percentile_ranks(feature_values[name], higher_is_better=True)
        for row in rows:
            client_id = row["client_id"]
            rank = ranks[client_id]
            row[f"{name}_percentile_rank"] = rank
            row[f"{name}_percentile_band"] = percentile_band(rank)
            row[f"{name}_position_label_ko"] = position_label_ko(rank)
            row["_features_json"][name]["percentile_rank"] = rank
            row["_features_json"][name]["percentile_band"] = percentile_band(rank)
            row["_features_json"][name]["position_label_ko"] = position_label_ko(rank)

    for label, _meta_key in RESULT_METRICS:
        ranks = percentile_ranks(result_values[label], higher_is_better=False)
        for row in rows:
            row[f"{label}_수행백분위"] = performance_label(ranks[row["client_id"]])

    metadata = {
        "cohort_size": len(cohort_rows),
        "source_demographics_csv": None,
        "source_primitive_indicator_root": str(pi_root),
        "source_task_result_root": str(task_result_root),
        "source_pi_filename": pi_filename,
        "aggregation": {
            "task": task,
            "method": "mean over numeric non-null window PI values",
            "percentile_method": "favorable inclusive percentile among cohort clients; ties receive the best rank within the tied value group; PI higher value means higher percentile; performance metrics lower value means better percentile",
        },
        "features": {
            feat["name"]: {"source_pi_name": feat["source"], "unit": feat["unit"]}
            for feat in features
        },
    }
    return rows, metadata


def csv_columns(task: str) -> List[str]:
    cols = list(META_COLUMNS) + ["pi_file", "window_count"]
    for feat in TASK_FEATURES[task]:
        name = feat["name"]
        cols.extend(
            [
                f"{name}_value",
                f"{name}_unit",
                f"{name}_source_pi_name",
                f"{name}_valid_window_count",
                f"{name}_missing_window_count",
                f"{name}_percentile_rank",
                f"{name}_percentile_band",
                f"{name}_position_label_ko",
            ]
        )
    for label, _meta_key in RESULT_METRICS:
        cols.extend([label, f"{label}_수행백분위"])
    return cols


def write_task_outputs(task: str, rows: List[Dict[str, Any]], metadata: Dict[str, Any], output_dir: Path) -> None:
    task_dir = output_dir / task
    task_dir.mkdir(parents=True, exist_ok=True)

    csv_path = task_dir / f"{task}_summary.csv"
    cols = csv_columns(task)
    with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=cols)
        writer.writeheader()
        for row in rows:
            writer.writerow({col: row.get(col) for col in cols})

    students = []
    for row in rows:
        task_obj = {
            "source_file": row["pi_file"],
            "result_file": row["_result_path"],
            "window_count": row["window_count"],
            "features": row["_features_json"],
            "performance": {
                label: {
                    "value": row[label],
                    "performance_percentile": row[f"{label}_수행백분위"],
                }
                for label, _meta_key in RESULT_METRICS
            },
        }
        students.append(
            {
                "user_name": row.get("user_name"),
                "client_id": row.get("client_id"),
                "demographics": {
                    "group_label": row.get("group_label"),
                    "sex": row.get("sex"),
                    "age_years": row.get("age_years"),
                    "session_date": row.get("session_date"),
                    "Initial": row.get("Initial"),
                },
                task: task_obj,
            }
        )

    json_path = task_dir / f"{task}_summary.json"
    obj = dict(metadata)
    obj["students"] = students
    with json_path.open("w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)

    print(f"[OK] {task}: {csv_path} / {json_path} (rows={len(rows)})")


def parse_tasks(values: Optional[Iterable[str]]) -> List[str]:
    if not values:
        return ["vst", "gng", "flanker"]
    tasks = []
    for value in values:
        for item in str(value).replace(",", " ").split():
            task = item.strip().lower()
            if task:
                tasks.append(task)
    unknown = [task for task in tasks if task not in TASK_FEATURES]
    if unknown:
        raise ValueError(f"Unknown task(s): {unknown}. Valid tasks: {sorted(TASK_FEATURES)}")
    return tasks


def main() -> None:
    parser = argparse.ArgumentParser(description="Build task summary CSV/JSON files from PI and result summaries.")
    parser.add_argument("--cohort_csv", default=str(DEFAULT_COHORT_CSV))
    parser.add_argument("--pi_root", default=str(DEFAULT_PI_ROOT))
    parser.add_argument("--task_result_root", default=str(DEFAULT_TASK_RESULT_ROOT))
    parser.add_argument("--output_dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--pi_filename", default=DEFAULT_PI_FILENAME)
    parser.add_argument("--tasks", nargs="*", default=["vst", "gng", "flanker"])
    args = parser.parse_args()

    cohort_csv = Path(args.cohort_csv).resolve()
    pi_root = Path(args.pi_root).resolve()
    task_result_root = Path(args.task_result_root).resolve()
    output_dir = Path(args.output_dir).resolve()
    tasks = parse_tasks(args.tasks)

    cohort_rows = read_cohort(cohort_csv)
    for task in tasks:
        rows, metadata = build_task_rows(
            task=task,
            cohort_rows=cohort_rows,
            pi_root=pi_root,
            task_result_root=task_result_root,
            pi_filename=args.pi_filename,
        )
        metadata["source_demographics_csv"] = str(cohort_csv)
        write_task_outputs(task, rows, metadata, output_dir)

    print(f"[DONE] Built summaries for tasks: {', '.join(tasks)}")


if __name__ == "__main__":
    main()
