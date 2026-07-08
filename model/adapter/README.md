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

이 디렉터리는 base 모델 전체를 full fine-tuning하지 않고, 4-bit 양자화된 base 모델 위에 LoRA 어댑터만 학습한 QLoRA 결과물을 담고 있다. 목적은 메모리 사용량을 줄이면서도 도메인 데이터에 맞는 적응을 빠르게 얻는 것이다.

## QLoRA fine-tuning

구체적으로는 다음 조합으로 동작한다.

- base model을 `AutoModelForCausalLM`으로 로드
- 4-bit 양자화 적용
- `prepare_model_for_kbit_training()`으로 k-bit 학습 준비
- `LoraConfig`를 적용해 LoRA 어댑터 삽입
- 실제 학습은 어댑터 파라미터 중심으로 진행

즉, 모델 전체 가중치를 업데이트하는 것이 아니라, 저랭크 어댑터를 학습해서 적은 메모리로 fine-tuning한다.

### 학습 세팅

실제 학습 세팅은 다음과 같다.

- `load_in_4bit = True`
- `dtype = bfloat16` 계열을 기본 사용
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

### 토크나이징과 라벨 마스킹

학습 데이터는 `tokenize_records()`에서 토큰화된다. 이때 전체 텍스트를 입력으로 넣고, prompt 부분은 `-100`으로 마스킹해서 loss 계산에서 제외한다. 즉, 모델은 prompt를 보고 assistant 응답을 맞히는 방향으로만 학습한다.

### 배치 크기와 유효 배치 크기

실제 유효 배치 크기는 다음과 같이 계산된다.

- `per_device_train_batch_size × gradient_accumulation_steps = 2 × 4 = 8`

GPU 메모리 부담을 낮추면서도, 누적을 통해 안정적인 학습 신호를 확보하는 방식이다.

### 저장되는 산출물

학습이 끝나면 `trainer.save_model()`과 `tokenizer.save_pretrained()`가 호출된다. 그래서 출력 디렉터리에는 최소한 다음이 저장된다.

- LoRA adapter weights
- adapter config
- tokenizer 파일들
- `train_metrics.json`

### Framework versions

- PEFT 0.18.1
