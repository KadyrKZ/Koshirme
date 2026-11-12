FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY pyproject.toml requirements.lock ./
RUN pip install --no-cache-dir -r requirements.lock && useradd --uid 10001 --create-home examguard
COPY app ./app
COPY alembic.ini ./
COPY migrations ./migrations
RUN mkdir -p uploads/screenshots && chown -R examguard:examguard /app
USER examguard
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && python -m app.seed && uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1 --ws-max-size 16384"]
