from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
import bcrypt
import jwt
import uuid
from pymongo import MongoClient
import os
from flask_jwt_extended import jwt_required, get_jwt_identity
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
SECRET_KEY = os.getenv("JWT_SECRET")

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
    

    if user and bcrypt.checkpw(password.encode('utf-8'), user['password'].encode('utf-8')):
      
        exp_hours = 168 if remember_me else 24  
        token = generate_token(user['Id'], username, exp_hours)
        log_entry['success'] = True
        log_entry['message'] = 'Login successful'
        log_entry['user_id'] = user['Id']
        logs_collection.insert_one(log_entry)
        return jsonify({
            'message': 'Login successful',
            'Id': user['Id'],
            'token': token,
            'username': username
        }), 200
    else:
        log_entry['message'] = 'Invalid credentials'
        logs_collection.insert_one(log_entry)
        return jsonify({'error': log_entry['message']}), 401


def generate_token(user_id, username, exp_hours=13):
    payload = {
        'user_id': user_id,
        'username': username,
        'exp': datetime.utcnow() + timedelta(hours=exp_hours)
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm='HS256')
    if isinstance(token, bytes):
        token = token.decode('utf-8')
    return token

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
    hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    user = {
        'Id': user_id,
        'username': username,
        'email': email,
        'password': hashed_password
    }
    
    users_collection.insert_one(user)

    def serialized_object(obj):
       
        obj = dict(obj)
        if '_id' in obj:
            obj['_id'] = str(obj['_id'])  
        return obj

    
    user_response = {k: v for k, v in user.items() if k != 'password'}
    user_response = serialized_object(user_response)

    token = generate_token(user_id, username)
    
    log_entry['success'] = True
    log_entry['message'] = 'Signup successful'
    log_entry['user_id'] = user_id
    logs_collection.insert_one(log_entry)

    return jsonify({
        "user": user_response,
        "token": token
    }), 201

@auth_bp.route('/logs', methods=['GET', 'POST'])
def manage_logs():
    if request.method == 'GET':
        try:
            logs = list(logs_collection.find({}, {'_id': 0}))
            return jsonify(logs), 200
        except Exception as e:
            return jsonify({'error': f'Failed to read logs: {str(e)}'}), 500
    elif request.method == 'POST':
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No log data provided'}), 400
        try:
            logs_collection.insert_one(data)
            return jsonify({'message': 'Log entry added'}), 201
        except Exception as e:
            return jsonify({'error': f'Failed to write log: {str(e)}'}), 500