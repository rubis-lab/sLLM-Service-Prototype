#!/usr/bin/env python
"""Small Hugging Face Transformers SSE server for localLLMChat.

The Node app keeps the browser-facing API. This process only owns model loading
and token generation for an HF checkpoint such as google/gemma-4-E4B-it.
"""

from __future__ import annotations

import argparse
from contextlib import nullcontext
import json
import os
import sys
import threading
import traceback
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


def env_flag(name: str, default: str = "0") -> bool:
    value = os.environ.get(name, default).strip().lower()
    return value not in {"", "0", "false", "no", "off"}


def env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


class ModelState:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.tokenizer = None
        self.model = None
        self.lock = threading.Lock()
        self.last_error: str | None = None
        self.loaded_adapters: dict[str, str] = {}

    @property
    def ready(self) -> bool:
        return self.tokenizer is not None and self.model is not None

    def load(self) -> None:
        if self.ready:
            return

        with self.lock:
            if self.ready:
                return

            try:
                import torch
                from transformers import AutoModelForCausalLM, AutoTokenizer

                dtype_name = self.args.dtype.lower()
                dtype = {
                    "auto": "auto",
                    "bfloat16": torch.bfloat16,
                    "bf16": torch.bfloat16,
                    "float16": torch.float16,
                    "fp16": torch.float16,
                    "float32": torch.float32,
                    "fp32": torch.float32,
                }.get(dtype_name, "auto")

                model_kwargs: dict[str, Any] = {
                    "trust_remote_code": True,
                }
                device_map = self.args.device_map.strip()
                if device_map and device_map.lower() not in {"none", "no", "false", "off"}:
                    model_kwargs["device_map"] = device_map
                if dtype != "auto":
                    model_kwargs["torch_dtype"] = dtype

                if self.args.load_in_4bit:
                    from transformers import BitsAndBytesConfig

                    compute_dtype = torch.bfloat16 if dtype in {"auto", torch.bfloat16} else torch.float16
                    model_kwargs["quantization_config"] = BitsAndBytesConfig(
                        load_in_4bit=True,
                        bnb_4bit_quant_type="nf4",
                        bnb_4bit_compute_dtype=compute_dtype,
                        bnb_4bit_use_double_quant=True,
                    )

                self.tokenizer = AutoTokenizer.from_pretrained(
                    self.args.model_id,
                    trust_remote_code=True,
                    extra_special_tokens={},
                    token=self.args.hf_token or None,
                )
                self.model = AutoModelForCausalLM.from_pretrained(
                    self.args.model_id,
                    token=self.args.hf_token or None,
                    **model_kwargs,
                )
                if "device_map" not in model_kwargs and self.args.device:
                    self.model.to(self.args.device)
                self.model.eval()
                self.last_error = None
            except Exception as exc:  # pragma: no cover - reported to UI
                self.last_error = f"{type(exc).__name__}: {exc}"
                raise

    def device_for_inputs(self):
        import torch

        if hasattr(self.model, "device"):
            return self.model.device

        for parameter in self.model.parameters():
            return parameter.device

        return torch.device("cpu")

    def load_adapter(self, adapter_dir: str, adapter_name: str) -> None:
        if not adapter_dir:
            return
        if adapter_name in self.loaded_adapters:
            return

        with self.lock:
            if adapter_name in self.loaded_adapters:
                return

            from peft import PeftModel

            if not os.path.isdir(adapter_dir):
                raise FileNotFoundError(f"adapter_dir not found: {adapter_dir}")

            if self.model.__class__.__name__.startswith("Peft"):
                self.model.load_adapter(adapter_dir, adapter_name=adapter_name)
            else:
                self.model = PeftModel.from_pretrained(
                    self.model,
                    adapter_dir,
                    adapter_name=adapter_name,
                    is_trainable=False,
                )
            self.model.eval()
            self.loaded_adapters[adapter_name] = adapter_dir

    def format_prompt(self, messages: list[dict[str, str]]) -> str:
        try:
            return self.tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True,
                enable_thinking=False,
            )
        except Exception:
            lines = []
            for message in messages:
                role = message.get("role", "user")
                content = message.get("content", "")
                lines.append(f"{role}: {content}")
            lines.append("assistant:")
            return "\n".join(lines)

    def model_context_limit(self) -> int | None:
        config = getattr(self.model, "config", None)
        candidates = [config, getattr(config, "text_config", None)]
        for candidate in candidates:
            if candidate is None:
                continue
            for attr in ("max_position_embeddings", "max_sequence_length", "seq_length", "n_positions"):
                value = getattr(candidate, attr, None)
                if isinstance(value, int) and value > 0:
                    return value
        return None

    def generate_stream(
        self,
        messages: list[dict[str, str]],
        temperature: float,
        max_new_tokens: int,
        adapter_dir: str | None = None,
        adapter_name: str | None = None,
    ):
        import torch
        from transformers import TextIteratorStreamer

        self.load()
        active_adapter = None
        if adapter_dir:
            active_adapter = adapter_name or "ft_v1"
            self.load_adapter(adapter_dir, active_adapter)
            if hasattr(self.model, "set_adapter"):
                self.model.set_adapter(active_adapter)

        prompt = self.format_prompt(messages)
        inputs = self.tokenizer(prompt, return_tensors="pt")
        input_tokens = int(inputs["input_ids"].shape[-1])
        context_limit = self.model_context_limit()
        effective_max_new_tokens = max_new_tokens
        if context_limit:
            available_new_tokens = context_limit - input_tokens
            if available_new_tokens <= 0:
                raise ValueError(
                    f"input_tokens={input_tokens} exceeds model context window={context_limit}"
                )
            effective_max_new_tokens = min(max_new_tokens, available_new_tokens)
        device = self.device_for_inputs()
        inputs = {key: value.to(device) for key, value in inputs.items()}

        streamer = TextIteratorStreamer(
            self.tokenizer,
            skip_prompt=True,
            skip_special_tokens=True,
            timeout=10.0,
        )
        generation_kwargs: dict[str, Any] = {
            **inputs,
            "streamer": streamer,
            "max_new_tokens": effective_max_new_tokens,
            "pad_token_id": self.tokenizer.eos_token_id,
        }

        if temperature and temperature > 0:
            generation_kwargs.update(
                {
                    "do_sample": True,
                    "temperature": float(temperature),
                }
            )
        else:
            generation_kwargs["do_sample"] = False

        error_holder: dict[str, str] = {}

        def run_generate() -> None:
            try:
                if active_adapter is None and hasattr(self.model, "disable_adapter"):
                    adapter_context = self.model.disable_adapter()
                else:
                    adapter_context = nullcontext()
                with torch.inference_mode(), adapter_context:
                    self.model.generate(**generation_kwargs)
            except Exception:
                error_holder["error"] = traceback.format_exc()

        thread = threading.Thread(target=run_generate, daemon=True)
        thread.start()

        parts: list[str] = []
        while True:
            try:
                text = next(streamer)
            except StopIteration:
                break
            except Exception:
                thread.join(timeout=0.1)
                if "error" in error_holder:
                    raise RuntimeError(error_holder["error"])
                if thread.is_alive():
                    continue
                break
            if text:
                parts.append(text)
                yield {"content": text}

        thread.join()
        if "error" in error_holder:
            raise RuntimeError(error_holder["error"])

        output_text = "".join(parts)
        output_tokens = len(self.tokenizer(output_text, add_special_tokens=False)["input_ids"])
        yield {
            "done": True,
            "tokenStats": {
                "inputTokens": input_tokens,
                "outputTokens": output_tokens,
                "totalTokens": input_tokens + output_tokens,
                "requestedMaxNewTokens": max_new_tokens,
                "maxNewTokens": effective_max_new_tokens,
                "contextLimit": context_limit,
            },
        }


class Handler(BaseHTTPRequestHandler):
    server_version = "localLLMChatHF/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("%s - - [%s] %s\n" % (self.client_address[0], self.log_date_time_string(), fmt % args))

    @property
    def state(self) -> ModelState:
        return self.server.state  # type: ignore[attr-defined]

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length") or "0")
        if length > 2 * 1024 * 1024:
            raise ValueError("request body too large")
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw) if raw else {}

    def write_sse(self, payload: dict[str, Any], event: str | None = None) -> None:
        if event:
            self.wfile.write(f"event: {event}\n".encode("utf-8"))
        self.wfile.write(("data: " + json.dumps(payload, ensure_ascii=False) + "\n\n").encode("utf-8"))
        self.wfile.flush()

    def do_GET(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] != "/health":
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
            return

        self.send_json(
            HTTPStatus.OK,
            {
                "ok": True,
                "ready": self.state.ready,
                "modelId": self.state.args.model_id,
                "loadIn4bit": self.state.args.load_in_4bit,
                "dtype": self.state.args.dtype,
                "deviceMap": self.state.args.device_map,
                "device": self.state.args.device,
                "loadedAdapters": sorted(self.state.loaded_adapters),
                "configuredMaxNewTokens": self.state.args.max_new_tokens,
                "lastError": self.state.last_error,
            },
        )

    def do_POST(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] != "/chat":
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
            return

        try:
            payload = self.read_json()
            messages = payload.get("messages") or []
            if not isinstance(messages, list) or not messages:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": "messages_required"})
                return

            temperature = float(payload.get("temperature", 0))
            max_new_tokens = int(payload.get("max_new_tokens") or self.state.args.max_new_tokens)
            adapter_dir = payload.get("adapter_dir") or None
            adapter_name = payload.get("adapter_name") or None

            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache, no-transform")
            self.send_header("Connection", "keep-alive")
            self.end_headers()

            for chunk in self.state.generate_stream(
                messages,
                temperature,
                max_new_tokens,
                adapter_dir=adapter_dir,
                adapter_name=adapter_name,
            ):
                if chunk.get("done"):
                    self.write_sse(chunk, event="done")
                else:
                    self.write_sse(chunk)
        except Exception as exc:  # pragma: no cover - surfaced in browser
            try:
                self.write_sse({"error": f"{type(exc).__name__}: {exc}"}, event="error")
            except Exception:
                self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default=os.environ.get("HF_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=env_int("HF_PORT", 8890))
    parser.add_argument("--model-id", default=os.environ.get("HF_MODEL_ID", "google/gemma-4-E4B-it"))
    parser.add_argument("--hf-token", default=os.environ.get("HF_TOKEN", ""))
    parser.add_argument("--device-map", default=os.environ.get("HF_DEVICE_MAP", "auto"))
    parser.add_argument("--device", default=os.environ.get("HF_DEVICE", ""))
    parser.add_argument("--dtype", default=os.environ.get("HF_DTYPE", "auto"))
    parser.add_argument("--max-new-tokens", type=int, default=env_int("HF_MAX_NEW_TOKENS", 1024))
    parser.add_argument("--load-in-4bit", action="store_true", default=env_flag("HF_LOAD_IN_4BIT", "0"))
    parser.add_argument("--preload", action="store_true", default=env_flag("HF_PRELOAD", "0"))
    parser.add_argument("--download-only", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if args.download_only:
        from huggingface_hub import snapshot_download

        print(f"Downloading {args.model_id} ...", flush=True)
        local_dir = snapshot_download(args.model_id, token=args.hf_token or None)
        print(f"Downloaded to: {local_dir}", flush=True)
        return

    state = ModelState(args)

    if args.preload:
        print(f"Loading {args.model_id} ...", flush=True)
        state.load()
        print("Model is ready.", flush=True)

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    server.state = state  # type: ignore[attr-defined]
    print(f"HF Transformers server listening on http://{args.host}:{args.port}", flush=True)
    print(f"model={args.model_id}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
