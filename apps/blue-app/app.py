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

DOLAR_CRIPTO_URL = "https://dolarapi.com/v1/dolares/cripto"
REAL_BRL_URL = "https://dolarapi.com/v1/cotizaciones/brl"

def get_app_info():
    """Obtener variables embedidas en la imagen"""
    version = os.getenv('APP_VERSION', 'unknown')
    color = os.getenv('APP_COLOR', 'unknown')
    return version, color

def get_exchange_data():
    """Obtain data APIs"""
    try:
        cripto_response = requests.get(DOLAR_CRIPTO_URL, timeout=10)
        cripto_data = cripto_response.json() if cripto_response.status_code == 200 else None

        real_response = requests.get(REAL_BRL_URL, timeout=10)
        real_data = real_response.json() if real_response.status_code == 200 else None

        return cripto_data, real_data
    except Exception as e:
        logger.error(f"Error fetching exchange data: {e}")
        return None, None

@app.route('/')
def index():
    version, color = get_app_info()
    logger.info(f'Request received for {color} version {version} on pod {socket.gethostname()}')

    cripto_data, real_data = get_exchange_data()

    return render_template('index.html',
                         version=version,
                         color=color,
                         hostname=socket.gethostname(),
                         cripto_data=cripto_data,
                         real_data=real_data,
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
        'features': ['html-ui', 'exchange-rates', 'auto-refresh']
    })

@app.route('/api/cotizaciones')
def api_cotizaciones():
    version, color = get_app_info()
    cripto_data, real_data = get_exchange_data()

    return jsonify({
        'version': version,
        'color': color,
        'hostname': socket.gethostname(),
        'timestamp': datetime.now().isoformat(),
        'cotizaciones': {
            'dolar_cripto': cripto_data,
            'real_brasileno': real_data
        }
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