#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_EXE="${PYTHON_EXE:-python3}"

export HF_MODEL_ID="${HF_MODEL_ID:-google/gemma-4-E4B-it}"
export HF_PORT="${HF_PORT:-8890}"
export HF_DTYPE="${HF_DTYPE:-float16}"
export HF_MAX_NEW_TOKENS="${HF_MAX_NEW_TOKENS:-512}"
export HF_HUB_DISABLE_XET="${HF_HUB_DISABLE_XET:-1}"
export HF_LOAD_IN_4BIT="${HF_LOAD_IN_4BIT:-1}"
export HF_DEVICE_MAP="${HF_DEVICE_MAP:-auto}"

echo "Using Python: ${PYTHON_EXE}"
echo "Installing/validating HF dependencies..."
"${PYTHON_EXE}" -m pip install -r "${SCRIPT_DIR}/requirements-hf-transformers.txt"

echo "Starting HF Transformers backend for ${HF_MODEL_ID} on port ${HF_PORT}"
"${PYTHON_EXE}" "${SCRIPT_DIR}/hf_transformers_server.py"
