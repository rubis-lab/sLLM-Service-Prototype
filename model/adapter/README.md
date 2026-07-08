---
base_model: models/gemma4_e4b_it/base
library_name: peft
pipeline_tag: text-generation
tags:
- base_model:adapter:models/gemma4_e4b_it/base
- lora
- transformers
---

# QLoRA Fine-tuning Adapter

This directory contains the output of a QLoRA run that fine-tunes only LoRA adapters on top of a 4-bit quantized base model instead of full fine-tuning the entire base model. The goal is to reduce memory usage while still adapting quickly to domain data.

## QLoRA fine-tuning

### Why use QLoRA

This script uses QLoRA instead of full fine-tuning the entire base model. It trains only LoRA adapters on top of a 4-bit quantized base model. The purpose is to lower memory usage while still achieving fast adaptation to domain-specific data.

Concretely, it works with the following combination:

- Load the base model with `AutoModelForCausalLM`
- Apply 4-bit quantization
- Prepare the model for k-bit training with `prepare_model_for_kbit_training()`
- Insert LoRA adapters with `LoraConfig`
- Train mainly the adapter parameters

In short, it does not update the full model weights. Instead, it fine-tunes low-rank adapters to reduce memory usage.

### Training settings

The training configuration used for this run is:

- `load_in_4bit = True`
- `dtype = bfloat16` by default
- `bnb_4bit_quant_type = nf4`
- `bnb_4bit_use_double_quant = True`
- `bnb_4bit_compute_dtype = bfloat16`
- `per_device_train_batch_size = 2`
- `per_device_eval_batch_size = 2`
- `gradient_accumulation_steps = 4`
- `learning_rate = 2e-4`
- `weight_decay = 0.01`
- `warmup_ratio = 0.03`
- `logging_steps = 10`
- `save_steps = 100`
- `eval_steps = 100`
- `lora_r = 16`
- `lora_alpha = 32`
- `lora_dropout = 0.05`
- `target_modules = all-linear`
- `seed = 42`
- `optim = paged_adamw_8bit`
- `lr_scheduler_type = cosine`
- `gradient_checkpointing = True`
- `max_seq_length = 4096`
- `num_train_epochs = 6`

### Tokenization and label masking

Training data is tokenized in `tokenize_records()`. The full text is fed into the model, and the prompt portion is masked with `-100` so it is excluded from loss calculation. In other words, the model learns to predict the assistant response from the prompt only.

### Batch size and effective batch size

The effective batch size is calculated as follows:

- `per_device_train_batch_size × gradient_accumulation_steps = 2 × 4 = 8`

This keeps GPU memory requirements low while using gradient accumulation to maintain a stable training signal.

### Saved artifacts

After training finishes, `trainer.save_model()` and `tokenizer.save_pretrained()` are called. The output directory therefore includes at least the following:

- LoRA adapter weights
- adapter config
- tokenizer files
- `train_metrics.json`

### Framework versions

- PEFT 0.18.1
