from flask import Flask, render_template, jsonify
import os
import socket
import logging
from datetime import datetime
import requests
import json

app = Flask(__name__)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

DOLARES_URL = "https://dolarapi.com/v1/dolares"

def get_app_info():
    """Obtain data APIs"""
    version = os.getenv('APP_VERSION', 'unknown')
    color = os.getenv('APP_COLOR', 'unknown')
    return version, color

def get_dolar_data():
    """Obtiene todos los tipos de dólar de la API"""
    try:
        response = requests.get(DOLARES_URL, timeout=10)
        if response.status_code == 200:
            dolar_data = response.json()
            logger.info(f"Datos de dólar obtenidos correctamente: {len(dolar_data)} tipos")
            return dolar_data
        else:
            logger.warning(f"API status: {response.status_code}")
            return None
    except Exception as e:
        logger.error(f"Error fetching dolar data: {e}")
        return None

def get_mock_data():
    """Datos de prueba para cuando la API no responde"""
    return [
        {
            "moneda": "USD",
            "casa": "oficial",
            "nombre": "Oficial",
            "compra": 1375,
            "venta": 1425,
            "fechaActualizacion": datetime.now().isoformat() + "Z",
            "mock": True
        },
        {
            "moneda": "USD",
            "casa": "blue",
            "nombre": "Blue",
            "compra": 1410,
            "venta": 1430,
            "fechaActualizacion": datetime.now().isoformat() + "Z",
            "mock": True
        }
    ]

@app.route('/')
def index():
    version, color = get_app_info()
    logger.info(f'Request received for {color} version {version} on pod {socket.gethostname()}')

    dolar_data = get_dolar_data()

    # mock data
    if not dolar_data:
        logger.info("Usando datos de prueba (mock)")
        dolar_data = get_mock_data()

    return render_template('index.html',
                         version=version,
                         color=color,
                         hostname=socket.gethostname(),
                         dolar_data=dolar_data,
                         now=datetime.now())

@app.route('/api')
def api():
    """Endpoint JSON simple"""
    version, color = get_app_info()
    return jsonify({
        'message': f'Hello from {color} app!',
        'version': version,
        'color': color,
        'hostname': socket.gethostname(),
        'timestamp': datetime.now().isoformat(),
        'features': ['html-ui', 'all-dollar-types', 'auto-refresh']
    })

@app.route('/api/dolares')
def api_dolares():
    """Endpoint con todos los tipos de dólar"""
    version, color = get_app_info()
    dolar_data = get_dolar_data()

    if not dolar_data:
        dolar_data = get_mock_data()

    return jsonify({
        'version': version,
        'color': color,
        'hostname': socket.gethostname(),
        'timestamp': datetime.now().isoformat(),
        'dolares': dolar_data,
        'total_tipos': len(dolar_data),
        'mock_data': any(d.get('mock', False) for d in dolar_data)
    })

@app.route('/health')
def health():
    version, color = get_app_info()
    logger.info('Health check requested')
    return {'status': 'healthy', 'version': version}

@app.route('/version')
def version():
    version, color = get_app_info()
    return {'version': version, 'color': color}

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal server error: {error}")
    return jsonify({
        "error": "Internal Server Error",
        "message": "Something went wrong on our side"
    }), 500

@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Endpoint not found"}), 404

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)