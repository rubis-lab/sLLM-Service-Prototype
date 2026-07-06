# SLLM Service KG Runtime Files

This folder contains the KG artifacts used by `sllm_service_ui` at prompt time.

Current scope:

- DSM-5 ADHD criteria guardrails.
- Unified primitive-indicator node metadata in `primitive_indicators_v2.json`.
- VST eye-tracking PI edges for selective attention / visual-search item discrimination burden.
- Flanker eye-tracking guardrails for interference-control and gaze/task engagement.
- Runtime task-to-PI edge metadata in `task_pi_edges_v2.json`.
- Optional KG architecture edits in `kg_architecture_edits_v1.json`.

Runtime behavior:

- The server detects DSM-5/ADHD, VST, Flanker, and matching PI names from the latest user message.
- Matched KG snippets are inserted as an additional system message before the request is sent to the selected model.
- The model is instructed to use KG content as constraints and to avoid diagnostic overclaims.
- When a task/PI edge matches, runtime KG now injects PI definition, unit, task-specific meaning, evidence, report constraints, and DSM-5 clinical-bridge candidates.
- DSM-5 output should be written as a "diagnostic criteria check items" section unless the input contains enough clinical evidence to evaluate criteria.

This is not weight-level fine-tuning. It is retrieval/context injection for local testing.
