FROM python:3.11-slim

WORKDIR /app

# Install dependencies first (layer caching)
COPY api/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY api/ ./api/
COPY knowledge/ ./knowledge/

# Railway injects $PORT at runtime; default to 8000 locally
ENV PORT=8000
EXPOSE 8000

CMD uvicorn api.main:app --host 0.0.0.0 --port ${PORT}
