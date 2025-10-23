import os
from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
import logging
from env_validator import validate_environment

from logging_config import setup_logging
from health_check import create_health_check

from rate_limiting import rate_limit
from dotenv import load_dotenv
load_dotenv()

# Validate environment before starting
validate_environment()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Production configuration
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = False
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')

# Setup production features
setup_logging(app)


# CORS configuration
if os.getenv('FLASK_ENV') == 'production':
    CORS(app, origins=[
        "https://*.railway.app",
        "https://your-custom-domain.com",
        "http://localhost:4200",
        "http://localhost:54485"
    ])
else:
    CORS(app, origins=["http://localhost:4200"])

# JWT Manager
jwt = JWTManager(app)
@app.route('/api/db_status', methods=['GET'])
def db_status():
    db_error_details = None  # Default value if no error details are available
    try:
        if db_connection_available:
            
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
                "connection_type": "Mock",
                "error_details": db_error_details
            }), 200
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Database connection error: {str(e)}",
            "connection_type": "None",
            "error_details": db_error_details
        }), 503
    

try:
    from pymongo import MongoClient
    mongo_uri = os.getenv('MONGO_URI')
    client = MongoClient(mongo_uri)
    db = client['EduResourceDB']
    
    # Test connection
    client.admin.command('ping')
    logger.info("✅ MongoDB connection successful")
    db_connection_available = True
    
except Exception as e:
    logger.error(f"❌ MongoDB connection failed: {e}")
    client = None
    db = None
    db_connection_available = False

# Store database in app config
app.config['MONGODB_CLIENT'] = client
app.config['MONGODB_DB'] = db
app.config['DB_CONNECTION_AVAILABLE'] = db_connection_available

# Setup health checks
create_health_check(app, db)

# Register blueprints
from auth import auth_bp
from admin_auth import  admin_auth_bp
from routes import routes_bp

try:
    from manage_resources import manage_resources_bp
    app.register_blueprint(manage_resources_bp, url_prefix='/api')
except ImportError:
    logger.warning("manage_resources module not found")

app.register_blueprint(auth_bp, url_prefix='/api')
app.register_blueprint(admin_auth_bp, url_prefix='/api')
app.register_blueprint(routes_bp)
# JWT error handlers
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

# Production startup
if __name__ == '__main__':
    port = int(os.getenv('PORT', 8000))
    debug = os.getenv('FLASK_ENV') != 'production'
    
    if os.getenv('FLASK_ENV') == 'production':
        logger.info(f"🚀 Starting ResourceOptimizer in PRODUCTION mode on port {port}")
    else:
        logger.info(f"🔧 Starting ResourceOptimizer in DEVELOPMENT mode on port {port}")
    
    app.run(host='0.0.0.0', port=port, debug=debug)