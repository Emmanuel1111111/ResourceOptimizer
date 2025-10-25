import os
from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
import logging
from dotenv import load_dotenv

# Load .env early
load_dotenv()

# Validate environment first
from env_validator import validate_environment
validate_environment()

# Configure logging
from logging_config import setup_logging

logger = logging.getLogger(__name__)

# === FLASK APP SETUP ===
app = Flask(__name__)

# === CONFIG ===
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = False
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')

# Setup logging
setup_logging(app)

# === CORS ===
allowed_origins = [
    "https://resource-optimizer-01.vercel.app/",
    "http://localhost:4200",
    "http://localhost:54119"
]


if os.getenv('FLASK_ENV') == 'production':
    CORS(app,
     origins=[
         "https://resource-optimizer-01.vercel.app",
         "https://resource-optimizer-ikux.vercel.app"
         "http://localhost:4200",
         "http://localhost:54119"
     ],
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
     supports_credentials=True,
     expose_headers=["Content-Type", "Authorization"]  # CRITICAL
)
else:
    CORS(app,
         origins=["http://localhost:4200"],
         methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
         allow_headers=["Content-Type", "Authorization"],
         supports_credentials=True)

jwt = JWTManager(app)

db = None
client = None
db_connection_available = False

try:
    from pymongo import MongoClient
    mongo_uri = os.getenv('MONGO_URI')
    if not mongo_uri:
        raise ValueError("MONGO_URI not set")
    
    client = MongoClient(mongo_uri)
    db = client['EduResourceDB']
    client.admin.command('ping')
    logger.info("MongoDB connection successful")
    db_connection_available = True
except Exception as e:
    logger.error(f"MongoDB connection failed: {e}")
    db_connection_available = False

# Store in app config
app.config['MONGODB_CLIENT'] = client
app.config['MONGODB_DB'] = db
app.config['DB_CONNECTION_AVAILABLE'] = db_connection_available

# === HEALTH CHECK (NOW db is defined) ===
from health_check import create_health_check
create_health_check(app, db)  # Now safe!

# === CUSTOM ROUTES ===
@app.route('/')
def home():
    return jsonify({
        "service": "ResourceOptimizer API",
        "status": "running",
        "version": "1.0",
        "endpoints": {
            "auth": "/api/auth/...",
            "admin": "/api/admin/...",
            "predict": "/api/predict",
            "health": "/health",
            "db_status": "/api/db_status"
        },
        "docs": "Coming soon"
    }), 200

@app.route('/api/db_status', methods=['GET'])
def db_status():
    try:
        if db_connection_available and db:
            db.command('ping')
            return jsonify({
                "status": "success",
                "message": "Database connection is active",
                "connection_type": "MongoDB"
            }), 200
        else:
            return jsonify({
                "status": "warning",
                "message": "Running with mock database - limited functionality",
                "connection_type": "Mock"
            }), 200
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Database connection error: {str(e)}",
            "connection_type": "None"
        }), 503

# === REGISTER BLUEPRINTS (ALL IMPORTS BEFORE USE) ===
from auth import auth_bp
from admin_auth import admin_auth_bp
from routes import routes_bp

# Optional: manage_resources
try:
    from manage_resources import manage_resources_bp
    app.register_blueprint(manage_resources_bp, url_prefix='/api')
except ImportError as e:
    logger.warning(f"manage_resources module not found: {e}")

app.register_blueprint(auth_bp, url_prefix='/api')
app.register_blueprint(admin_auth_bp, url_prefix='/api')
app.register_blueprint(routes_bp, url_prefix='/api')

# === JWT ERROR HANDLERS ===
@jwt.invalid_token_loader
def invalid_token_callback(error_string):
    return jsonify({
        "status": "error",
        "error": "Invalid token",
        "message": "The provided token is invalid"
    }), 401

@jwt.unauthorized_loader
def missing_token_callback(error_string):
    return jsonify({
        "status": "error",
        "error": "Authorization required",
        "message": "Request does not contain an access token"
    }), 401

@jwt.expired_token_loader
def expired_token_callback(jwt_header, jwt_payload):
    return jsonify({
        "status": "error",
        "error": "Token expired",
        "message": "The provided token has expired"
    }), 401

# === RUN APP ===
if __name__ == '__main__':
    port = int(os.getenv('PORT', 8000))
    debug = os.getenv('FLASK_ENV') != 'production'
    
    logger.info(f"Starting ResourceOptimizer in {'PRODUCTION' if not debug else 'DEVELOPMENT'} mode on port {port}")
    app.run(host='0.0.0.0', port=port, debug=debug)