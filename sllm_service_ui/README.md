# SLLM Service UI

This directory is the UI/runtime layer of `sllm_service_prototype`.

It is intentionally close to the original `llmChat` runtime:

- Node web UI
- Ollama local model backend flow
- optional Hugging Face/PEFT backend
- KG context injection
- KG viewer pages
- structured summary lookup from `../data_preprocessing/summary`
- PDF export

Private runtime files such as `.env`, logs, local model caches, virtual
environments, and generated summary/data files should not be committed.

## Main Run Method

From this directory:

```bash
./install_and_run.sh
```

The script follows the original `llmChat` flow:

1. Loads `.env` if it exists.
2. Creates `.env` from `.env.example` if missing.
3. Checks or installs Node.js 18+.
4. Installs/starts Ollama unless `SKIP_OLLAMA=1`.
5. Optionally pulls Ollama models when `PULL_MODELS=1`.
6. Checks `server.js` and `public/app.js`.
7. Stops any previous process on the configured port.
8. Starts the UI in the background by default.
9. Writes:
   ```text
   local-llm-chat.pid
   local-llm-chat.port
   local-llm-chat.log
   ```

After it starts, open:

```text
http://127.0.0.1:8788
```

Run in foreground:

```bash
START_BACKGROUND=0 ./install_and_run.sh
```

## Minimal Run Method

If dependencies and backends are already prepared:

```bash
./run.sh
```

or:

```bash
npm start
```

## Configuration

Copy:

```bash
cp .env.example .env
```

Important defaults:

```text
HOST=0.0.0.0
PORT=8788

OLLAMA_MODEL=gemma4:e4b
QWEN_14_MODEL=qwen3:14b
OLLAMA_URL=http://127.0.0.1:11534
OLLAMA_BIN=.local/ollama/bin/ollama
OLLAMA_MODELS=.local/ollama_models

HF_BACKEND_SCRIPT=server_handoff_20260501/app/hf_transformers_server.py
HF_FT3_ADAPTER_DIR=../model/adapter

PROTOTYPE_SUMMARY_ROOT=../data_preprocessing/summary
CLIENT_DEMOGRAPHICS_FILE=../data_preprocessing/clients_metadata.csv
HOSPITAL_DATA_REAL_DIR=../pdss_data
```

Relative paths in `.env` are resolved from this `sllm_service_ui` directory for
UI-local resources, or from the project root where noted above.

## Directory Contents

```text
sllm_service_ui/
  server.js                         # Node HTTP server and model routing
  install_and_run.sh                 # Main Ollama-based run script
  run.sh                             # Minimal run script
  package.json
  .env.example                       # Relative-path configuration template
  public/                            # Browser UI
  kg/                                # Runtime KG JSON files
  tools/report_pdf.py                # PDF export helper
  assets/fonts/                      # PDF/report fonts
  server_handoff_20260501/app/       # Optional Hugging Face backend
```

## Notes

- Ollama is part of the default original runtime flow. Set `SKIP_OLLAMA=1` only
  when an Ollama-compatible backend is already available or not needed.
- Hugging Face adapter support is still available through the HF backend.
- The default adapter path is `../model/adapter`.
- Summary-driven report prompts use files under `../data_preprocessing/summary`.
