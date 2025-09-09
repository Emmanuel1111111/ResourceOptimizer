
import os
import sys

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(__file__))

# Set production environment
os.environ.setdefault('FLASK_ENV', 'production')

from app import app
from logging_config import setup_logging

# Setup production logging
setup_logging(app)

if __name__ == "__main__":
    port = int(os.getenv('PORT', 8000))
    app.run(host='0.0.0.0', port=port)
