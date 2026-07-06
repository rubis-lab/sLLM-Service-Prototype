#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

PYTHON_BIN="${PYTHON_BIN:-python}"
RAW_DATA_DIR="${RAW_DATA_DIR:-${PROJECT_ROOT}/pdss_data}"
PI_OUTPUT_DIR="${PI_OUTPUT_DIR:-${PROJECT_ROOT}/data_preprocessing/primitive_indicator}"
TASK_RESULTS_DIR="${TASK_RESULTS_DIR:-${PROJECT_ROOT}/data_preprocessing/task_results}"
SUMMARY_OUTPUT_DIR="${SUMMARY_OUTPUT_DIR:-${PROJECT_ROOT}/data_preprocessing/summary}"
CLIENTS_METADATA="${CLIENTS_METADATA:-${PROJECT_ROOT}/data_preprocessing/clients_metadata.csv}"
PI_SHEET="${PI_SHEET:-eye-tracking}"
PI_EXCEL="${PI_EXCEL:-}"
ONLY_CLIENT_ARGS=()

usage() {
  cat <<EOF
Usage:
  $(basename "$0") [options]

Options:
  --pi-excel PATH          Optional Excel file containing PI names to include.
  --pi-sheet NAME          Excel sheet name when --pi-excel is given. Default: eye-tracking.
  --raw-data-dir PATH      Raw data root. Default: <project_root>/pdss_data.
  --pi-output-dir PATH     PI output dir. Default: <project_root>/data_preprocessing/primitive_indicator.
  --task-results-dir PATH  Task result output dir. Default: <project_root>/data_preprocessing/task_results.
  --summary-output-dir PATH Final summary output dir. Default: <project_root>/data_preprocessing/summary.
  --clients-metadata PATH  Client metadata CSV. Default: <project_root>/data_preprocessing/clients_metadata.csv.
  --only-client-id ID      Process only this client. Can be repeated.
  -h, --help               Show this help.

Environment:
  PYTHON_BIN               Python executable from your conda environment. Default: python.

Conda setup example:
  conda create -n pdss-preprocess python=3.11
  conda activate pdss-preprocess
  pip install -r "${PROJECT_ROOT}/requirements.txt"
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pi-excel)
      PI_EXCEL="$2"
      shift 2
      ;;
    --pi-sheet)
      PI_SHEET="$2"
      shift 2
      ;;
    --raw-data-dir)
      RAW_DATA_DIR="$2"
      shift 2
      ;;
    --pi-output-dir)
      PI_OUTPUT_DIR="$2"
      shift 2
      ;;
    --task-results-dir)
      TASK_RESULTS_DIR="$2"
      shift 2
      ;;
    --summary-output-dir)
      SUMMARY_OUTPUT_DIR="$2"
      shift 2
      ;;
    --clients-metadata)
      CLIENTS_METADATA="$2"
      shift 2
      ;;
    --only-client-id)
      ONLY_CLIENT_ARGS+=("$2")
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[ERROR] Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -n "${PI_EXCEL}" && ! -f "${PI_EXCEL}" ]]; then
  echo "[ERROR] PI Excel file not found: ${PI_EXCEL}" >&2
  exit 1
fi

if [[ ! -f "${CLIENTS_METADATA}" ]]; then
  echo "[ERROR] clients metadata CSV not found: ${CLIENTS_METADATA}" >&2
  exit 1
fi

mkdir -p "${PI_OUTPUT_DIR}" "${TASK_RESULTS_DIR}" "${SUMMARY_OUTPUT_DIR}"

PI_EXCEL_ARGS=()
if [[ -n "${PI_EXCEL}" ]]; then
  PI_EXCEL_ARGS=(--pi_excel "${PI_EXCEL}" --pi_sheet "${PI_SHEET}")
fi

echo "[1/3] Extracting eye-tracking primitive indicators..."
if [[ ${#ONLY_CLIENT_ARGS[@]} -gt 0 ]]; then
  "${PYTHON_BIN}" "${PROJECT_ROOT}/data_preprocessing/scripts/extract_eye_tracking_pi.py" \
    --base_path "${RAW_DATA_DIR}" \
    --output_base_path "${PI_OUTPUT_DIR}" \
    "${PI_EXCEL_ARGS[@]}" \
    --only_client_id "${ONLY_CLIENT_ARGS[@]}"
else
  "${PYTHON_BIN}" "${PROJECT_ROOT}/data_preprocessing/scripts/extract_eye_tracking_pi.py" \
    --base_path "${RAW_DATA_DIR}" \
    --output_base_path "${PI_OUTPUT_DIR}" \
    "${PI_EXCEL_ARGS[@]}"
fi

echo "[2/3] Collecting task result summaries..."
if [[ ${#ONLY_CLIENT_ARGS[@]} -gt 0 ]]; then
  "${PYTHON_BIN}" "${PROJECT_ROOT}/data_preprocessing/scripts/collect_task_results.py" \
    --base_path "${RAW_DATA_DIR}" \
    --output_dir "${TASK_RESULTS_DIR}" \
    --only_client_id "${ONLY_CLIENT_ARGS[@]}"
else
  "${PYTHON_BIN}" "${PROJECT_ROOT}/data_preprocessing/scripts/collect_task_results.py" \
    --base_path "${RAW_DATA_DIR}" \
    --output_dir "${TASK_RESULTS_DIR}"
fi

echo "[3/3] Building task summaries..."
"${PYTHON_BIN}" "${PROJECT_ROOT}/data_preprocessing/scripts/build_task_summaries.py" \
  --cohort_csv "${CLIENTS_METADATA}" \
  --pi_root "${PI_OUTPUT_DIR}" \
  --task_result_root "${TASK_RESULTS_DIR}" \
  --output_dir "${SUMMARY_OUTPUT_DIR}" \
  --tasks vst gng flanker

echo "[DONE] Pipeline complete."
echo "PI output: ${PI_OUTPUT_DIR}"
echo "Task results: ${TASK_RESULTS_DIR}"
echo "Summaries: ${SUMMARY_OUTPUT_DIR}"
