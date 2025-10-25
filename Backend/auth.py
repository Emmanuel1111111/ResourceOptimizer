from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
import bcrypt
import jwt
import uuid
from pymongo import MongoClient
import os
from flask_jwt_extended import jwt_required, get_jwt_identity, create_access_token
from dotenv import load_dotenv
from bson import ObjectId
load_dotenv()
auth_bp = Blueprint('auth', __name__)

# MongoDB Atlas Connection
MONGO_URI = os.getenv("MONGO_URI")
client = MongoClient(MONGO_URI)
db = client.EduResourceDB
users_collection = db.users
logs_collection = db.logs

# JWT Secret Key
SECRET_KEY = os.getenv("JWT_SECRET", "fallback-secret-key")  # Added fallback key

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    
   
    username = data.get('username')
  
    password = data.get('password')
    remember_me = data.get('rememberMe', False)  

    log_entry = {
        'timestamp': datetime.utcnow().isoformat(),
        'action': 'login',
        'username': username,
        'success': False,
        'message': '',
        'user_id': None,
        'remember_me': remember_me  
    }

    if not username or not password:
        log_entry['message'] = 'Missing username or password'
        logs_collection.insert_one(log_entry)
        return jsonify({'error': log_entry['message']}), 400

    user = users_collection.find_one({'username': username})
    

    # Debug logging (remove in production)
    print(f"Login attempt for username: {username}")
    print(f"User found: {user is not None}")
    if user:
        print(f"Stored password hash: {user['password'][:20]}...")  # Only show first 20 chars
    
    # Fix: Remove .encode('utf-8') from the stored password hash
    if user and bcrypt.checkpw(password.encode('utf-8'), user['password'].encode('utf-8') if isinstance(user['password'], str) else user['password']):
      
        exp_hours = 168 if remember_me else 24  
        # Use Flask-JWT-Extended to create token
        access_token = create_access_token(
            identity=str(user['_id']),  # Ensure string conversion
            additional_claims={"username": username},
            expires_delta=timedelta(hours=exp_hours)
        )
        
        log_entry['success'] = True
        log_entry['message'] = 'Login successful'
        log_entry['user_id'] = str(user['_id'])
        log_entry['email'] = user.get('email', '')  
        logs_collection.insert_one(log_entry)
        return jsonify({
            'message': 'Login successful',
            'Id': str(user['_id']),  # Ensure string conversion
            'token': access_token,
            'username': username,
            'email': user.get('email', '')  
        }), 200
    else:
        log_entry['message'] = 'Invalid credentials'
        logs_collection.insert_one(log_entry)
        return jsonify({'error': log_entry['message']}), 401


def generate_token(user_id, username, exp_hours=13):
   
    access_token = create_access_token(
        identity=user_id,
        additional_claims={"username": username},
        expires_delta=timedelta(hours=exp_hours)
    )
    return access_token

@auth_bp.route('/signup', methods=['POST'])
def signup():
    data = request.get_json()
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')

    log_entry = {
        'timestamp': datetime.utcnow().isoformat(),
        'action': 'signup',
        'username': username,
        'email': email,
        'success': False,
        'message': '',
        'user_id': None
    }

    if not username or not email or not password:
        log_entry['message'] = 'Missing required fields'
        logs_collection.insert_one(log_entry)
        return jsonify({'error': log_entry['message']}), 400

    if users_collection.find_one({'username': username}):
        log_entry['message'] = 'Username already exists'
        logs_collection.insert_one(log_entry)
        return jsonify({'error': log_entry['message']}), 409

    user_id = str(uuid.uuid4())
    # Fix: Store password hash as bytes, not string
    hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
    
    user = {
        '_id': user_id,
        'username': username,
        'email': email,
        'password': hashed_password  # Store as bytes
    }
    
    users_collection.insert_one(user)

    def serialized_object(obj):
       
        obj = dict(obj)
        if '_id' in obj:
            obj['_id'] = str(obj['_id'])  
        return obj
     
    token = generate_token(user_id, username, exp_hours=13000)
    
    
    user_response={
        'Id':user_id,
        'username': username,
        'email': email,
        'token': token,
        'message': 'Signup successful'
        }
    

    serialized_object(user_response)
    
    log_entry['success'] = True
    log_entry['message'] = 'Signup successful'
    log_entry['user_id'] = user_id
    logs_collection.insert_one(log_entry)

    return jsonify({
        "user": user_response,
        "status": "sucess",
       
    }), 201

@auth_bp.route('/logs', methods=['GET', 'POST'])
@jwt_required()
def manage_logs():
    try:
        # Get current user from JWT token
        current_user = get_jwt_identity()
        if not current_user:
            return jsonify({"status": "error", "error": "Authentication required"}), 401
            
        if request.method == 'GET':
            try:
                # Find logs for the current user
                logs = list(logs_collection.find({}, {'_id': 0}))
                
                # Format the response
                response = []
                for log in logs:
                    # Convert any ObjectId to string
                    for key, value in log.items():
                        if isinstance(value, ObjectId):
                            log[key] = str(value)
                    response.append(log)
                
                return jsonify(response), 200
            except Exception as e:
                return jsonify({'status': 'error', 'error': f'Failed to read logs: {str(e)}'}), 500
        elif request.method == 'POST':
            data = request.get_json()
            if not data:
                return jsonify({'status': 'error', 'error': 'No log data provided'}), 400
            try:
                # Add user_id to the log entry
                data['user_id'] = current_user
                logs_collection.insert_one(data)
                return jsonify({'status': 'success', 'message': 'Log entry added'}), 201
            except Exception as e:
                return jsonify({'status': 'error', 'error': f'Failed to write log: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'status': 'error', 'error': f'Authentication error: {str(e)}'}), 401