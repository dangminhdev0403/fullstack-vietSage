# ─── Open MRZ Server ──────────────────────────────────────────
# Multi-stage build: Tesseract + Python deps → slim runtime image
# Build : docker build -t open-mrz .
# Run   : docker run -p 8787:8787 open-mrz
# ──────────────────────────────────────────────────────────────

FROM python:3.12-slim AS base

# Tesseract OCR + shared libs for OpenCV headless
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN groupadd --gid 10001 openmrz \
    && useradd --uid 10001 --gid openmrz --create-home openmrz

# Python deps (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application source (no .runtime, no __pycache__)
COPY --chown=openmrz:openmrz server.py open_mrz_engine.py mrz_parser.py vietsage_adapter.py api.py ./
COPY --chown=openmrz:openmrz assets/ ./assets/

ENV PYTHONUNBUFFERED=1
ENV TESSDATA_PREFIX=/app/assets/models

EXPOSE 8787
USER openmrz

# --host 0.0.0.0 binds inside the container; Compose does not publish this port.
CMD ["python", "server.py", "--port", "8787", "--host", "0.0.0.0"]
