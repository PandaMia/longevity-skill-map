FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install -r requirements.txt \
    && useradd --system --uid 10001 --user-group --no-create-home app

COPY app.py ./
COPY config/ ./config/
COPY graph/longevity-skills.json ./graph/longevity-skills.json
COPY static/ ./static/
COPY scripts/validate_graph.py ./scripts/validate_graph.py

# Fail the build if the bundled graph or application cannot be loaded.
RUN python scripts/validate_graph.py \
    && python -c "from app import app"

USER app

EXPOSE 8000

# The only published port is on the host loopback interface, behind host Caddy.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
