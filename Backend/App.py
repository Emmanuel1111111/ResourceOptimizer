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
from admin_auth import admin_auth_bp
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

MONGO_URI = os.getenv('MONGO_URI')
print("MONGO_URI:", MONGO_URI)

db_connection_available = False
db_error_details = "No connection attempt yet"

def fix_mongo_uri(uri):
    """
    Fix common MongoDB URI issues that cause DNS resolution problems
    """
    if not uri:
        return None
    
    # If using SRV format, try converting to standard format
    if uri.startswith('mongodb+srv://'):
        print("Detected SRV format, attempting conversion to standard format...")
        try:
            # Extract credentials and cluster info
            if '@' in uri:
                creds_part = uri.split('mongodb+srv://')[1].split('@')[0]
                cluster_part = uri.split('@')[1]
                
                # Common Atlas cluster patterns
                if 'mongodb.net' in cluster_part:
                    # Convert SRV to standard format with multiple hosts
                    cluster_name = cluster_part.split('.mongodb.net')[0]
                    
                    # Try common Atlas shard configurations
                    standard_hosts = [
                        f"{cluster_name}-shard-00-00.mongodb.net:27017",
                        f"{cluster_name}-shard-00-01.mongodb.net:27017", 
                        f"{cluster_name}-shard-00-02.mongodb.net:27017"
                    ]
                    
                    db_name = ""
                    if '/' in cluster_part:
                        db_name = "/" + cluster_part.split('/')[-1]
                    
                    standard_uri = f"mongodb://{creds_part}@{','.join(standard_hosts)}{db_name}?ssl=true&replicaSet=atlas-{cluster_name}-shard-0&authSource=admin&retryWrites=true&w=majority"
                    print(f"Converted to standard format")
                    return standard_uri
                    
        except Exception as e:
            print(f"URI conversion failed: {e}")
            
    return uri

def create_mongo_client(uri, timeout=5000):
    """
    Create MongoDB client with multiple connection strategies
    """
    if not uri:
        raise ValueError("No MongoDB URI provided")
    
    connection_strategies = [
        # Strategy 1: Original URI with extended timeout
        {
            'uri': uri,
            'options': {
                'serverSelectionTimeoutMS': 30000,  # Increased timeout
                'connectTimeoutMS': 30000,
                'socketTimeoutMS': 30000,
                'maxPoolSize': 10,
                'retryWrites': True,
                'w': 'majority',
                'retryReads': True
            },
            'description': 'Original URI with extended timeout'
        },
        
        # Strategy 2: Try with different timeout settings
        {
            'uri': uri,
            'options': {
                'serverSelectionTimeoutMS': 60000,  # 1 minute timeout
                'connectTimeoutMS': 60000,
                'socketTimeoutMS': 60000,
                'maxPoolSize': 5,
                'retryWrites': True,
                'w': 'majority',
                'retryReads': True,
                'maxIdleTimeMS': 30000
            },
            'description': 'Extended timeout strategy'
        }
    ]
    
    for strategy in connection_strategies:
        if not strategy['uri']:
            continue
            
        try:
            print(f"Trying connection strategy: {strategy['description']}")
            client = MongoClient(strategy['uri'], **strategy['options'])
            
            # Test the connection
            client.server_info()
            print(f"✅ {strategy['description']} connection successful!")
            return client
            
        except Exception as e:
            print(f"❌ {strategy['description']} failed: {type(e).__name__}: {e}")
            continue
    
    # If all strategies fail, raise the last exception
    raise Exception("All MongoDB connection strategies failed")

try:
    if not MONGO_URI:
        raise ValueError("MONGO_URI environment variable is not set")
        
    print("Attempting MongoDB connection with multiple strategies...")
    client = create_mongo_client(MONGO_URI)
    print("MongoDB connection successful")
    db = client.EduResourceDB
    db_connection_available = True
    
except Exception as e:
    db_error_details = str(e)
    print(f"MongoDB Atlas connection error: {e}")
    
  
    if "No nameservers" in str(e) or "NXDOMAIN" in str(e):
        print("\n🔧 DNS RESOLUTION ERROR DETECTED")
        print("This is likely caused by:")
        print("1. Network/firewall blocking DNS queries")
        print("2. Corporate network restrictions")
        print("3. DNS server issues")
        print("\nTrying solutions...")
        
        db_error_details = "DNS resolution error: Unable to resolve MongoDB hostname. Try using a direct connection string instead of SRV format."
        
        # Try to fix DNS issues
        try:
            import socket
            import dns.resolver
            
            print("Testing DNS resolution...")
            if MONGO_URI and '@' in MONGO_URI:
                hostname = MONGO_URI.split('@')[1].split('/')[0].split('?')[0]
                print(f"Testing hostname: {hostname}")
                
                # Test different DNS resolvers
                resolvers = ['8.8.8.8', '1.1.1.1', '208.67.222.222']  # Google, Cloudflare, OpenDNS
                
                for resolver_ip in resolvers:
                    try:
                        resolver = dns.resolver.Resolver()
                        resolver.nameservers = [resolver_ip]
                        answers = resolver.resolve(hostname, 'A')
                        print(f"✅ DNS resolution successful using {resolver_ip}")
                        
                        # Try connecting with this resolver
                        import os
                        os.environ['RES_OPTIONS'] = f'nameserver {resolver_ip}'
                        client = create_mongo_client(MONGO_URI)
                        db = client.EduResourceDB
                        db_connection_available = True
                        print("✅ MongoDB connection successful with custom DNS!")
                        break
                        
                    except Exception as dns_err:
                        print(f"❌ DNS resolver {resolver_ip} failed: {dns_err}")
                        continue
                        
        except ImportError:
            print("⚠️  dnspython not installed. Install with: pip install dnspython")
        except Exception as dns_fix_err:
            print(f"DNS fix attempt failed: {dns_fix_err}")
    
    # Fallback to local MongoDB if Atlas fails
    if not db_connection_available:
        try:
            print("\n🔄 Attempting local MongoDB fallback...")
            client = MongoClient('mongodb://localhost:27017/', serverSelectionTimeoutMS=3000)
            client.server_info()
            print("✅ Connected to local MongoDB")
            db = client.EduResourceDB
            db_connection_available = True
            db_error_details = "Connected to local MongoDB (Atlas connection failed)"
        except Exception as local_e:
            local_error = str(local_e)
            print(f"❌ Local MongoDB connection failed: {local_error}")
            
            if "refused" in local_error:
                print("\n💡 To start local MongoDB:")
                print("  macOS: brew services start mongodb/brew/mongodb-community")
                print("  Linux: sudo systemctl start mongod")
                print("  Windows: net start MongoDB")
                
            db_error_details = f"Local MongoDB: {local_error}"
            print("\n⚠️  WARNING: Application will run with limited functionality")
        
        # Create a mock database for minimal functionality
        if not db_connection_available:
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
                
                def command(self, cmd):
                    print(f"Mock command called: {cmd}")
                    return {"ok": 1}
            
            class MockDatabase:
                def __init__(self, name):
                    self.name = name
                    self._collections = {}
                
                def __getattr__(self, name):
                    if name not in self._collections:
                        self._collections[name] = MockCollection(name)
                    return self._collections[name]
                
                def command(self, cmd):
                    print(f"Mock database command: {cmd}")
                    return {"ok": 1}
            
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
            print("✅ Created mock database for minimal functionality")
        
except Exception as e:
    print(f"Error during MongoDB connection setup: {e}")

# Add a route to check database status
@app.route('/api/db_status', methods=['GET'])
def db_status():
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

# Register blueprints
app.register_blueprint(auth_bp, url_prefix='/api')
app.register_blueprint(routes_bp)
app.register_blueprint(manage_resources_bp, url_prefix='/api')
app.register_blueprint(admin_auth_bp, url_prefix='/api')  # Add admin auth blueprint

# Make database connection available to blueprints
app.config['MONGODB_CLIENT'] = client
app.config['MONGODB_DB'] = db
app.config['DB_CONNECTION_AVAILABLE'] = db_connection_available

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