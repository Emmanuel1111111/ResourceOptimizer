from flask import Flask, jsonify
from flask_cors import CORS
from pymongo import MongoClient
import os
from auth import auth_bp
from routes import routes_bp
from dotenv import load_dotenv
from manage_resources import manage_resources_bp
from flask_jwt_extended import JWTManager
from datetime import timedelta
load_dotenv()

app = Flask(__name__)

# Set JWT secret key with fallback
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET', 'your-default-secret-key')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=24)  # Set token expiration
app.config['JWT_TOKEN_LOCATION'] = ['headers']  # Look for JWT in headers
app.config['JWT_HEADER_NAME'] = 'Authorization'  # Header name
app.config['JWT_HEADER_TYPE'] = 'Bearer'  # Header type
        
# Initialize JWT
jwt = JWTManager(app)

# Configure CORS
CORS(app, supports_credentials=True, resources={r"/*": {"origins": "http://localhost:4200"}})

# MongoDB Atlas Configuration
MONGO_URI = os.getenv('MONGO_URI')
print("MONGO_URI:", MONGO_URI)

# Global flag to track database connection status
db_connection_available = False
db_error_details = "No connection attempt yet"

try:
    # Use direct connection to avoid SRV resolution issues
    if not MONGO_URI:
        raise ValueError("MONGO_URI environment variable is not set")
        
    # Check for common MongoDB URI format issues
    if MONGO_URI.startswith('mongodb+srv://') and 'mongodb.net' not in MONGO_URI:
        print("Warning: MongoDB URI appears to be using SRV format but may be missing the correct domain")
        
    print("Attempting MongoDB connection...")
    # Remove directConnection=True as it's incompatible with multiple hosts in MongoDB Atlas
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    # Test the connection
    client.server_info()
    print("MongoDB connection successful")
    db = client.EduResourceDB
    db_connection_available = True
except Exception as e:
    db_error_details = str(e)
    print(f"MongoDB connection error: {e}")
    # Provide more specific error messages based on the exception
    if "No nameservers" in str(e):
        print("DNS resolution error: Unable to resolve MongoDB hostname. This could be due to network issues or DNS configuration.")
        db_error_details = "DNS resolution error: Unable to resolve MongoDB hostname. Try using a direct connection string instead of SRV format."
    elif "Authentication failed" in str(e):
        print("Authentication error: Invalid username or password in MongoDB URI.")
        db_error_details = "Authentication failed. Please check your MongoDB username and password."
    elif "timed out" in str(e) or "timeout" in str(e).lower():
        print("Connection timeout: MongoDB server may be down or network issues are preventing connection.")
        db_error_details = "Connection timeout. MongoDB server may be unreachable or blocked by a firewall."
    
    # Fallback to local MongoDB if available
    try:
        print("Attempting local MongoDB connection...")
        client = MongoClient('mongodb://localhost:27017/', serverSelectionTimeoutMS=5000)
        client.server_info()
        print("Connected to local MongoDB")
        db = client.EduResourceDB
        db_connection_available = True
    except Exception as local_e:
        local_error = str(local_e)
        print(f"Local MongoDB connection failed: {local_error}")
        if "refused" in local_error:
            print("Connection refused: Local MongoDB server is not running.")
            db_error_details += " Local MongoDB connection refused. Is MongoDB running?"
        else:
            db_error_details += f" Local fallback also failed: {local_error}"
        
        print("WARNING: Application will run with limited functionality")
        
        # Create a mock database for minimal functionality
        from pymongo.errors import ServerSelectionTimeoutError
        
        class MockCollection:
            def __init__(self, name):
                self.name = name
                self.data = []
            
            def find(self, query=None, projection=None):
                print(f"Mock find called on {self.name} with query: {query}")
                return []
                
            def find_one(self, query=None, projection=None):
                print(f"Mock find_one called on {self.name} with query: {query}")
                return None
                
            def distinct(self, field):
                print(f"Mock distinct called on {self.name} for field: {field}")
                return []
                
            def count_documents(self, query):
                print(f"Mock count_documents called on {self.name} with query: {query}")
                return 0
                
            def insert_one(self, document):
                print(f"Mock insert_one called on {self.name} with document: {document}")
                class MockResult:
                    @property
                    def inserted_id(self):
                        return "mock_id"
                return MockResult()
                
            def update_one(self, filter, update):
                print(f"Mock update_one called on {self.name} with filter: {filter}, update: {update}")
                class MockResult:
                    @property
                    def matched_count(self):
                        return 0
                    @property
                    def modified_count(self):
                        return 0
                return MockResult()
        
        class MockDatabase:
            def __init__(self, name):
                self.name = name
                self._collections = {}
            
            def __getattr__(self, name):
                if name not in self._collections:
                    self._collections[name] = MockCollection(name)
                return self._collections[name]
        
        class MockClient:
            def __init__(self):
                self._databases = {}
            
            def __getattr__(self, name):
                if name not in self._databases:
                    self._databases[name] = MockDatabase(name)
                return self._databases[name]
                
            def server_info(self):
                raise ServerSelectionTimeoutError("This is a mock client")
        
        client = MockClient()
        db = client.EduResourceDB
        print("Created mock database for minimal functionality")

# Add a route to check database status
@app.route('/api/db_status', methods=['GET'])
def db_status():
    try:
        if db_connection_available:
            # Try a simple operation to verify connection is still alive
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

# Register blueprints
app.register_blueprint(auth_bp, url_prefix='/api')
app.register_blueprint(routes_bp)
app.register_blueprint(manage_resources_bp, url_prefix='/api')

# Error handlers
@app.errorhandler(404)
def not_found(e):
    return jsonify({"status": "error", "error": "The requested resource was not found"}), 404

@app.errorhandler(422)
def unprocessable_entity(e):
    return jsonify({"status": "error", "error": "The request was well-formed but could not be processed due to semantic errors"}), 422

@app.errorhandler(500)
def internal_server_error(e):
    return jsonify({"status": "error", "error": "An internal server error occurred"}), 500

# JWT error handlers
@jwt.invalid_token_loader
def invalid_token_callback(error_string):
    return jsonify({
        'status': 'error',
        'error': 'Invalid token',
        'msg': error_string
    }), 401

@jwt.unauthorized_loader
def missing_token_callback(error_string):
    return jsonify({
        'status': 'error',
        'error': 'Authorization required',
        'msg': error_string
    }), 401

@jwt.expired_token_loader
def expired_token_callback(jwt_header, jwt_payload):
    return jsonify({
        'status': 'error',
        'error': 'Token has expired',
        'msg': 'Please log in again'
    }), 401

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)