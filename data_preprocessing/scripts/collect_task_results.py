#!/usr/bin/env python3
"""
Collect per-task result summaries from pdss_data-style directories.

Expected input structure:
  {base_path}/{date}/{client_id}/{task}/result/{archive_id}/result.json

Output:
  {output_dir}/{client_id}/result.json
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, Optional


META_KEYS = (
    "numTrials",
    "numOmissionErrors",
    "numCommissionErrors",
    "meanResponseTime",
    "stdResponseTime",
)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_PREPROCESSING_DIR = PROJECT_ROOT / "data_preprocessing"
DEFAULT_RAW_DATA_DIR = PROJECT_ROOT / "pdss_data"
DEFAULT_OUTPUT_DIR = DATA_PREPROCESSING_DIR / "task_results"


def parse_completed_at(value: Any) -> datetime:
    if not isinstance(value, str) or not value:
        return datetime.min
    normalized = value
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return datetime.min


def iter_result_files(base_path: Path) -> Iterable[Path]:
    return base_path.glob("*/*/*/result/*/result.json")


def summarize_result(result_path: Path) -> Optional[Dict[str, Any]]:
    try:
        with result_path.open("r", encoding="utf-8") as f:
            obj = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(f"[WARN] Failed to read {result_path}: {e}")
        return None

    meta = obj.get("meta")
    if not isinstance(meta, dict):
        meta = {}

    return {
        "completedAt": obj.get("completedAt"),
        "meta": {key: meta.get(key) for key in META_KEYS},
    }


def collect_results(base_path: Path, only_client_id: Optional[set[str]] = None) -> Dict[str, Dict[str, Dict[str, Any]]]:
    collected: Dict[str, Dict[str, Dict[str, Any]]] = {}
    completed_index: Dict[tuple[str, str], datetime] = {}

    for result_path in iter_result_files(base_path):
        rel = result_path.relative_to(base_path)
        parts = rel.parts
        if len(parts) < 6:
            continue

        client_id = parts[1]
        task = parts[2]
        if only_client_id is not None and client_id not in only_client_id:
            continue

        summary = summarize_result(result_path)
        if summary is None:
            continue

        completed_at_dt = parse_completed_at(summary.get("completedAt"))
        key = (client_id, task)
        if key in completed_index and completed_at_dt <= completed_index[key]:
            continue

        completed_index[key] = completed_at_dt
        collected.setdefault(client_id, {})[task] = {
            "task": task,
            "completedAt": summary.get("completedAt"),
            "meta": summary["meta"],
        }

    return collected


def write_results(collected: Dict[str, Dict[str, Dict[str, Any]]], output_dir: Path) -> None:
    for client_id, task_results in sorted(collected.items()):
        client_dir = output_dir / client_id
        client_dir.mkdir(parents=True, exist_ok=True)
        out_path = client_dir / "result.json"
        ordered = {task: task_results[task] for task in sorted(task_results)}
        with out_path.open("w", encoding="utf-8") as f:
            json.dump(ordered, f, ensure_ascii=False, indent=2)
        print(f"[OK] {client_id} -> {out_path} (tasks={len(ordered)})")


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect task result summaries by client.")
    parser.add_argument(
        "--base_path",
        default=str(DEFAULT_RAW_DATA_DIR),
        help="Raw data root with date/client/task directories. Default: <project_root>/pdss_data",
    )
    parser.add_argument(
        "--output_dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help="Directory to write {client_id}/result.json. Default: <project_root>/data_preprocessing/task_results",
    )
    parser.add_argument(
        "--only_client_id",
        nargs="*",
        help="Optional client_id filter. If omitted, process all clients.",
    )
    args = parser.parse_args()

    base_path = Path(args.base_path).resolve()
    output_dir = Path(args.output_dir).resolve()
    only_client_id = set(args.only_client_id) if args.only_client_id else None

    collected = collect_results(base_path, only_client_id=only_client_id)
    write_results(collected, output_dir)
    print(f"[DONE] Wrote result summaries for {len(collected)} clients")


if __name__ == "__main__":
    main()
