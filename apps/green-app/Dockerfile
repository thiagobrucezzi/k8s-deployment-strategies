FROM python:3.9-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY templates/ templates/

ENV APP_VERSION=v2.0.0
ENV APP_COLOR=green
ENV APP_ENV=production

EXPOSE 5000
CMD ["python", "app.py"]