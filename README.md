# sLLM Service Prototype

This repository contains a prototype sLLM service for generating Korean
attention-assessment reports from PDSS task data.

The top-level runtime is `sllm_service_ui/`. It serves the web UI, retrieves
task summaries, injects KG context, calls a local LLM backend, and exports PDF
reports. Before running the UI with real participants, raw PDSS data must be
prepared and converted into summary files by the preprocessing pipeline.

## Overall Flow

```text
1. Prepare local input data
   pdss_data/
   data_preprocessing/clients_metadata.csv

2. Run preprocessing
   raw eye-tracking/result files
     -> data_preprocessing/primitive_indicator/
     -> data_preprocessing/task_results/
     -> data_preprocessing/summary/

3. Run the sLLM service UI
   data_preprocessing/summary/
   model/adapter/
   sllm_service_ui/kg/
     -> browser report generation
     -> PDF export
```

Participant raw data, client metadata, generated PI files, generated task
results, generated summaries, local environment files, logs, and model caches
should be treated as local/private runtime data.

## Repository Layout

```text
sllm_service_prototype/
  README.md
  requirements.txt
  .gitignore

  model/
    adapter/
      README.md
      adapter_config.json
      adapter_model.safetensors
      tokenizer.json
      tokenizer_config.json
      ...

  data_preprocessing/
    scripts/
      run_preprocessing_pipeline.sh
      extract_eye_tracking_pi.py
      collect_task_results.py
      build_task_summaries.py

  sllm_service_ui/
    README.md
    server.js
    package.json
    .env.example
    install_and_run.sh
    run.sh
    public/
    kg/
      dsm5_adhd_criteria_v1.json
      primitive_indicators_v2.json
      task_pi_edges_v2.json
      kg_architecture_edits_v1.json
    tools/
      report_pdf.py
    assets/fonts/
    server_handoff_20260501/app/
      hf_transformers_server.py
      run_hf_gemma4_server.sh
      requirements-hf-transformers.txt
```

The following directories/files are expected locally but should not be committed
with real participant data:

```text
pdss_data/
data_preprocessing/clients_metadata.csv
data_preprocessing/primitive_indicator/
data_preprocessing/task_results/
data_preprocessing/summary/
data_preprocessing/percentile_cutoffs.csv
sllm_service_ui/.env
sllm_service_ui/node_modules/
sllm_service_ui/.local/
sllm_service_ui/.pdf_venv/
sllm_service_ui/*.log
sllm_service_ui/*.pid
sllm_service_ui/*.port
```

## 1. Prepare Raw PDSS Data

Create `pdss_data/` under the project root. The preprocessing scripts expect a
PDSS-style directory structure:

```text
pdss_data/
  {date}/
    {client_id}/
      {task}/
        eye-tracking/
          {archive_id}/
            eye-tracking.csv
        result/
          {archive_id}/
            result.json
```

Example:

```text
pdss_data/
  20250923/
    0a9a382e-5b25-4953-b275-e84dc7e1507a/
      vst/
        eye-tracking/
          44c2e71d-96c5-4b21-9ca7-da6fe1b6a7d4/
            eye-tracking.csv
        result/
          170afe49-7fb7-476a-afbd-84b25d6f66d0/
            result.json
```

The current summary pipeline is built for:

```text
vst
gng
flanker
```

### Required `eye-tracking.csv` Columns

The eye-tracking extractor requires gaze coordinates and timestamps. The exact
raw export may contain many additional columns, but the extractor must be able
to read:

```text
timestamp
x
y
```

### Required `result.json` Fields

Each task result JSON should include `completedAt` and the following `meta`
fields:

```json
{
  "completedAt": "2025-09-18T16:05:48.732000+09",
  "meta": {
    "numTrials": 40,
    "numOmissionErrors": 0,
    "numCommissionErrors": 2,
    "meanResponseTime": 603,
    "stdResponseTime": 261
  }
}
```

## 2. Prepare Client Metadata

Create:

```text
data_preprocessing/clients_metadata.csv
```

Required header:

```csv
user_name,group_label,sex,age_years,session_date,Initial,client_id
```

Example:

```csv
user_name,group_label,sex,age_years,session_date,Initial,client_id
CNU-S010,Inattentive,F,7,9-18-2025,LNR,87fdcd10-c53a-4a0d-ad4a-7de0d9dcdba7
CNU-S014,Subclinical,M,7,9-23-2025,KKB,0a9a382e-5b25-4953-b275-e84dc7e1507a
```

`client_id` must match the directory names under `pdss_data/`.

For the current supported cohort, `user_name` values should be one of:

| | | | | | |
|---|---|---|---|---|---|
| `CNU-S005` | `CNU-S008` | `CNU-S010` | `CNU-S011` | `CNU-S012` | `CNU-S014` |
| `CNU-S016` | `CNU-S018` | `CNU-S021` | `CNU-S022` | `CNU-S023` | `CNU-S025` |
| `CNU-S026` | `CNU-S027` | `CNU-S036` | `CNU-S039` | `CNU-S041` | `CNU-S044` |
| `CNU-S045` | `CNU-S046` | `CNU-S047` | `CNU-S049` | `CNU-S051` | `CNU-S052` |
| `CNU-S054` | `CNU-S055` | `CNU-S056` | `CNU-S058` | `CNU-S061` | `CNU-S063` |
| `CNU-S064` | `CNU-S066` | `CNU-S071` | `CNU-S073` | `CNU-S077` | `CNU-S081` |
| `CNU-S082` | `CNU-S083` | `CNU-S084` | `CNU-S085` | `CNU-S086` | `CNU-S087` |
| `CNU-S090` | `CNU-S092` | `CNU-S094` | `CNU-S097` | `CNU-S099` | `CNU-S101` |

## 3. Prepare The Model Adapter

The UI expects a local fine-tuned adapter at:

```text
model/adapter/
```

Expected files include:

```text
adapter_config.json
adapter_model.safetensors
tokenizer.json
tokenizer_config.json
```

If the adapter is stored somewhere else, copy:

```bash
cp sllm_service_ui/.env.example sllm_service_ui/.env
```

Then set:

```text
HF_FT3_ADAPTER_DIR=../model/adapter
```

Relative paths in `sllm_service_ui/.env` are resolved from the
`sllm_service_ui/` directory.

## 4. Install Python Dependencies

From the project root:

```bash
conda create -n sllm-service python=3.11
conda activate sllm-service
python -m pip install -r requirements.txt
```

This environment is used for:

- data preprocessing
- PDF export
- optional Hugging Face/PEFT backend execution

## 5. Run Data Preprocessing

From the project root:

```bash
./data_preprocessing/scripts/run_preprocessing_pipeline.sh
```

The pipeline runs three steps.

### Step 1: Extract Eye-Tracking Primitive Indicators

Script:

```text
data_preprocessing/scripts/extract_eye_tracking_pi.py
```

Input:

```text
pdss_data/{date}/{client_id}/{task}/eye-tracking/{archive_id}/eye-tracking.csv
```

Output:

```text
data_preprocessing/primitive_indicator/{client_id}/{task}/eye-tracking_pi_2_2.json
```

The default window size is 2 seconds and the default stride is 2 seconds.

### Step 2: Collect Task Results

Script:

```text
data_preprocessing/scripts/collect_task_results.py
```

Input:

```text
pdss_data/{date}/{client_id}/{task}/result/{archive_id}/result.json
```

Output:

```text
data_preprocessing/task_results/{client_id}/result.json
```

### Step 3: Build Task Summaries

Script:

```text
data_preprocessing/scripts/build_task_summaries.py
```

Inputs:

```text
data_preprocessing/clients_metadata.csv
data_preprocessing/primitive_indicator/{client_id}/{task}/eye-tracking_pi_2_2.json
data_preprocessing/task_results/{client_id}/result.json
```

Outputs:

```text
data_preprocessing/summary/{task}/{task}_summary.csv
data_preprocessing/summary/{task}/{task}_summary.json
```

To process one participant:

```bash
./data_preprocessing/scripts/run_preprocessing_pipeline.sh \
  --only-client-id 0a9a382e-5b25-4953-b275-e84dc7e1507a
```

To use custom paths:

```bash
./data_preprocessing/scripts/run_preprocessing_pipeline.sh \
  --raw-data-dir ./pdss_data \
  --clients-metadata ./data_preprocessing/clients_metadata.csv \
  --pi-output-dir ./data_preprocessing/primitive_indicator \
  --task-results-dir ./data_preprocessing/task_results \
  --summary-output-dir ./data_preprocessing/summary
```

## 6. Summary Contents

The final summary files are generated for:

```text
vst
gng
flanker
```

Each summary row keeps the participant metadata columns:

```text
user_name
group_label
sex
age_years
session_date
Initial
client_id
```

It also stores the referenced PI JSON path as:

```text
pi_file
```

### PI Features

VST:

```text
et_first_fixation_duration_mean
et_fixation_duration_mean
et_fixation_duration_std
et_fixation_dispersion_mean
```

`et_fixation_dispersion_mean` is computed from
`et_rms_based_fixation_dispersion_mean`.

GNG:

```text
et_saccade_rate_mean
et_saccade_direction_mean
et_gaze_offset_to_screen_center_mean
```

Flanker:

```text
et_first_fixation_latency_mean
et_aoi_non_aoi_transition_count
et_aoi_dwell_time_mean
```

For each PI feature, the summary includes:

```text
value
unit
source_pi_name
valid_window_count
missing_window_count
percentile_rank
percentile_band
position_label_ko
```

### Task Result Metrics

Each task summary also includes:

```text
누락오류
오경보오류
반응시간 평균
반응시간 표준편차
```

These values come from:

```text
numOmissionErrors
numCommissionErrors
meanResponseTime
stdResponseTime
```

For PI features, larger values produce higher percentile ranks. For task result
metrics, smaller values are treated as better performance. Ties receive the most
favorable rank within the tied group.

## 7. Run The sLLM Service UI

From the UI directory:

```bash
cd sllm_service_ui
./install_and_run.sh
```

This follows the original local runtime flow:

1. Loads `.env` if it exists.
2. Creates `.env` from `.env.example` if missing.
3. Checks or installs Node.js 18+.
4. Installs/starts Ollama unless `SKIP_OLLAMA=1`.
5. Optionally pulls Ollama models when `PULL_MODELS=1`.
6. Checks `server.js` and `public/app.js`.
7. Starts the UI server.

Default URL:

```text
http://127.0.0.1:8788
```

For a minimal run when dependencies and model backends are already ready:

```bash
cd sllm_service_ui
./run.sh
```

See [sllm_service_ui/README.md](sllm_service_ui/README.md) for UI-specific
configuration, Ollama/HF backend settings, KG files, and PDF export behavior.

## 8. Runtime Data Lookup

The UI reads generated summaries from:

```text
data_preprocessing/summary/
```

The default `.env.example` points to:

```text
PROTOTYPE_SUMMARY_ROOT=../data_preprocessing/summary
CLIENT_DEMOGRAPHICS_FILE=../data_preprocessing/clients_metadata.csv
HOSPITAL_DATA_REAL_DIR=../pdss_data
HF_FT3_ADAPTER_DIR=../model/adapter
```

All of these are relative to `sllm_service_ui/`.

## 9. GitHub Publishing Checklist

Before publishing, remove private runtime data and generated participant
outputs:

```text
pdss_data/
data_preprocessing/clients_metadata.csv
data_preprocessing/primitive_indicator/
data_preprocessing/task_results/
data_preprocessing/summary/
data_preprocessing/percentile_cutoffs.csv
data_preprocessing/__pycache__/
sllm_service_ui/.env
sllm_service_ui/node_modules/
sllm_service_ui/.local/
sllm_service_ui/.pdf_venv/
sllm_service_ui/*.log
sllm_service_ui/*.pid
sllm_service_ui/*.port
```

If any of these files were already tracked by Git, remove them from the Git
index as well as from the working tree before pushing.

## Troubleshooting

If preprocessing produces no summaries, check:

1. `data_preprocessing/clients_metadata.csv` exists.
2. The metadata file has a `client_id` column.
3. Each `client_id` has matching raw data under `pdss_data/`.
4. Eye-tracking files follow the expected `eye-tracking.csv` path.
5. Task result files follow the expected `result.json` path.
6. The Python environment has packages from `requirements.txt`.

If the UI cannot load participant data, check:

1. `data_preprocessing/summary/{task}/{task}_summary.json` exists.
2. `CLIENT_DEMOGRAPHICS_FILE` points to the same cohort metadata.
3. The entered participant ID matches `user_name`, `Initial`, or `client_id`
   depending on the current UI lookup logic.
4. `HF_FT3_ADAPTER_DIR` points to a valid adapter directory.
