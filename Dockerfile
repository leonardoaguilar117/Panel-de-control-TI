FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TZ=America/Mexico_City \
    INVENTARIO_DB_DIR=/datos

WORKDIR /srv

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# No se ejecuta como root. El UID debe poder escribir en la carpeta de datos montada
RUN useradd --system --uid 1000 --no-create-home app && mkdir -p /datos && chown app /datos
USER app

# La base vive en un volumen: sobrevive a cualquier actualizacion de la imagen
VOLUME ["/datos"]
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
