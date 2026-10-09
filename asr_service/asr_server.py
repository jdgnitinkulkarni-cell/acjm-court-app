"""
ACJM Court App - local AI voice typing service (AI4Bharat IndicConformer).

Runs on this PC at http://127.0.0.1:8010 and is called only by the main
ACJM backend (backend/server.py -> /api/asr/transcribe). Audio never leaves
this computer.

  GET  /health      -> {"ok": true, "loaded": bool, "message": str}
  POST /transcribe  -> multipart: audio=<wav file>, language=gu|hi
                       returns {"text": "..."}
"""
import io
import logging
import os
import threading
import wave
from pathlib import Path

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile

ROOT = Path(__file__).parent
log = logging.getLogger("acjm-asr")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


def _load_env_file():
    env_path = ROOT / ".env"
    try:
        lines = env_path.read_text(encoding="utf-8-sig").splitlines()
    except Exception:
        return
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key and not os.environ.get(key):
            os.environ[key] = value.strip().strip('"').strip("'")


_load_env_file()

MODEL_ID = os.environ.get("ASR_MODEL_ID", "ai4bharat/indic-conformer-600m-multilingual")
DECODING = os.environ.get("ASR_DECODING", "rnnt").strip().lower() or "rnnt"
SUPPORTED = {"as", "bn", "brx", "doi", "gu", "hi", "kn", "kok", "ks", "mai", "ml",
             "mni", "mr", "ne", "or", "pa", "sa", "sat", "sd", "ta", "te", "ur"}
TARGET_SR = 16000

_model = None
_load_error = ""
_loading = False
_model_lock = threading.Lock()
_infer_lock = threading.Lock()


def _load_model():
    global _model, _load_error, _loading
    with _model_lock:
        if _model is not None:
            return _model
        _loading = True
        try:
            import torch
            from transformers import AutoModel

            token = os.environ.get("HF_TOKEN", "").strip() or None
            log.info("Loading %s (first run downloads the model, please wait)...", MODEL_ID)
            model = AutoModel.from_pretrained(MODEL_ID, trust_remote_code=True, token=token)
            device = "cuda" if torch.cuda.is_available() else "cpu"
            try:
                model = model.to(device)
            except Exception:
                pass
            try:
                model.eval()
            except Exception:
                pass
            _model = model
            _load_error = ""
            log.info("Model loaded on %s. Voice typing AI is ready.", device)
        except Exception as exc:  # keep the service up and report the reason
            _load_error = f"{type(exc).__name__}: {exc}"
            log.error("Could not load the speech model: %s", _load_error)
        finally:
            _loading = False
        return _model


app = FastAPI(title="ACJM Voice AI (IndicConformer)")


@app.on_event("startup")
def _warm_up():
    threading.Thread(target=_load_model, daemon=True).start()


@app.get("/health")
def health():
    if _model is not None:
        return {"ok": True, "loaded": True, "model": MODEL_ID, "message": "ready"}
    if _loading:
        return {"ok": True, "loaded": False, "message": "AI speech model is loading"}
    return {"ok": True, "loaded": False, "message": _load_error or "AI speech model not loaded"}


def _resample(audio: np.ndarray, sr: int) -> np.ndarray:
    if sr == TARGET_SR or audio.size == 0:
        return audio
    duration = audio.size / float(sr)
    n_out = max(1, int(round(duration * TARGET_SR)))
    x_old = np.linspace(0.0, duration, num=audio.size, endpoint=False)
    x_new = np.linspace(0.0, duration, num=n_out, endpoint=False)
    return np.interp(x_new, x_old, audio).astype(np.float32)


def _decode_audio(data: bytes) -> np.ndarray:
    if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        with wave.open(io.BytesIO(data), "rb") as wf:
            channels = wf.getnchannels()
            width = wf.getsampwidth()
            sr = wf.getframerate()
            frames = wf.readframes(wf.getnframes())
        if width == 2:
            audio = np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768.0
        elif width == 4:
            audio = np.frombuffer(frames, dtype="<i4").astype(np.float32) / 2147483648.0
        elif width == 1:
            audio = (np.frombuffer(frames, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
        else:
            raise HTTPException(400, f"Unsupported WAV sample width: {width}")
        if channels > 1:
            audio = audio.reshape(-1, channels).mean(axis=1)
        return _resample(audio, sr)
    # Other formats (webm/ogg/mp3) need torchaudio + ffmpeg.
    try:
        import torchaudio

        wav, sr = torchaudio.load(io.BytesIO(data))
        audio = wav.mean(dim=0).numpy().astype(np.float32)
        return _resample(audio, int(sr))
    except Exception as exc:
        raise HTTPException(400, f"Could not read audio (send 16 kHz WAV): {exc}") from exc


@app.post("/transcribe")
def transcribe(audio: UploadFile = File(...), language: str = Form("gu")):
    # Plain "def": FastAPI runs it in a worker thread, so inference never blocks /health.
    lang = (language or "gu").strip().lower()
    if lang not in SUPPORTED:
        raise HTTPException(400, f"Language '{lang}' is not supported by IndicConformer")
    if _model is None and _loading:
        raise HTTPException(503, "AI speech model is still loading, please wait")
    model = _model or _load_model()
    if model is None:
        raise HTTPException(503, _load_error or "AI speech model is not loaded yet")
    samples = _decode_audio(audio.file.read())
    if samples.size < TARGET_SR * 0.3:  # shorter than 0.3 s: nothing to recognise
        return {"text": "", "language": lang}
    import torch

    wav = torch.from_numpy(np.ascontiguousarray(samples, dtype=np.float32)).unsqueeze(0)
    with _infer_lock, torch.inference_mode():
        result = model(wav, lang, DECODING)
    if isinstance(result, (list, tuple)):
        result = result[0] if result else ""
    text = str(result or "").strip()
    return {"text": text, "language": lang}
