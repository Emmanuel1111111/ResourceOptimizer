from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity, create_access_token, create_refresh_token
from datetime import datetime, timedelta
import bcrypt
import pyotp
import qrcode
import io
import base64
import secrets
import json
from pymongo import MongoClient
from bson import ObjectId
import os
from dotenv import load_dotenv
import re
from functools import wraps
import time
from collections import defaultdict, deque
import hashlib

# Import notification service
try:
    from notification_service import notification_service
except ImportError:
    # Fallback if notification service is not available
    notification_service = None

load_dotenv()

admin_auth_bp = Blueprint('admin_auth', __name__)

# Use the same MongoDB connection as the main app
# The connection will be set up in App.py and we'll access it through current_app

# Rate limiting storage
rate_limit_storage = defaultdict(lambda: deque(maxlen=10))
blocked_accounts = {}

# Security Configuration
MAX_LOGIN_ATTEMPTS = 5
BLOCK_DURATION = 30 * 60  # 30 minutes
RATE_LIMIT_WINDOW = 15 * 60  # 15 minutes
PASSWORD_MIN_LENGTH = 12

class SecurityService:
    @staticmethod
    def hash_password(password: str) -> str:
        """Hash password with bcrypt"""
        salt = bcrypt.gensalt()
        return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
    
    @staticmethod
    def verify_password(password: str, hashed: str) -> bool:
        """Verify password against hash"""
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
    
    @staticmethod
    def validate_admin_username(username: str) -> bool:
        """Validate admin username format"""
        pattern = r'^admin\.[a-zA-Z0-9._-]+$'
        return re.match(pattern, username) is not None
    
    @staticmethod
    def validate_strong_password(password: str) -> dict:
        """Validate password strength"""
        errors = []
        
        if len(password) < PASSWORD_MIN_LENGTH:
            errors.append(f'Password must be at least {PASSWORD_MIN_LENGTH} characters long')
        
        if not re.search(r'[A-Z]', password):
            errors.append('Password must contain at least one uppercase letter')
        
        if not re.search(r'[a-z]', password):
            errors.append('Password must contain at least one lowercase letter')
        
        if not re.search(r'\d', password):
            errors.append('Password must contain at least one number')
        
        if not re.search(r'[!@#$%^&*()_+\-=\[\]{};\':"\\|,.<>\/?]', password):
            errors.append('Password must contain at least one special character')
        
        return {
            'is_valid': len(errors) == 0,
            'errors': errors
        }
    
    @staticmethod
    def generate_device_fingerprint(request) -> str:
        """Generate device fingerprint from request"""
        user_agent = request.headers.get('User-Agent', '')
        ip_address = request.remote_addr or ''
        accept_language = request.headers.get('Accept-Language', '')
        
        fingerprint_data = f"{user_agent}|{ip_address}|{accept_language}"
        return hashlib.sha256(fingerprint_data.encode()).hexdigest()[:32]

class RateLimiter:
    @staticmethod
    def is_rate_limited(username: str, ip_address: str) -> bool:
        """Check if username/IP is rate limited"""
        current_time = time.time()
        
        # Check if account is blocked
        if username in blocked_accounts:
            if current_time < blocked_accounts[username]:
                return True
            else:
                del blocked_accounts[username]
        
        # Check rate limiting
        key = f"{username}:{ip_address}"
        attempts = rate_limit_storage[key]
        
        # Remove old attempts outside the window
        while attempts and attempts[0] < current_time - RATE_LIMIT_WINDOW:
            attempts.popleft()
        
        return len(attempts) >= MAX_LOGIN_ATTEMPTS
    
    @staticmethod
    def record_attempt(username: str, ip_address: str, success: bool):
        """Record login attempt"""
        current_time = time.time()
        key = f"{username}:{ip_address}"
        
        if not success:
            rate_limit_storage[key].append(current_time)
            
            # Check if we should block the account
            if len(rate_limit_storage[key]) >= MAX_LOGIN_ATTEMPTS:
                blocked_accounts[username] = current_time + BLOCK_DURATION
        else:
            # Clear attempts on successful login
            if key in rate_limit_storage:
                del rate_limit_storage[key]
            if username in blocked_accounts:
                del blocked_accounts[username]

class MFAService:
    @staticmethod
    def generate_secret() -> str:
        """Generate MFA secret"""
        return pyotp.random_base32()
    
    @staticmethod
    def generate_qr_code(username: str, secret: str) -> str:
        """Generate QR code for MFA setup"""
        totp_uri = pyotp.totp.TOTP(secret).provisioning_uri(
            name=username,
            issuer_name="Resource Optimizer Admin"
        )
        
        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(totp_uri)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Convert to base64
        img_buffer = io.BytesIO()
        img.save(img_buffer)
        img_buffer.seek(0)
        
        img_base64 = base64.b64encode(img_buffer.getvalue()).decode()
        return f"data:image/png;base64,{img_base64}"
    
    @staticmethod
    def verify_totp(secret: str, token: str) -> bool:
        """Verify TOTP token"""
        totp = pyotp.TOTP(secret)
        return totp.verify(token, valid_window=1)
    
    @staticmethod
    def generate_backup_codes() -> list:
        """Generate backup codes"""
        return [secrets.token_hex(4).upper() for _ in range(10)]

def get_db_connection():
    """Get database connection from Flask app context"""
    try:
        client = current_app.config.get('MONGODB_CLIENT')
        db = current_app.config.get('MONGODB_DB')
        if client is not None and db is not None:
            return db
        else:
            # Fallback to direct connection if not available in app context
            MONGO_URI = os.getenv("MONGO_URI")
            if MONGO_URI:
                client = MongoClient(MONGO_URI)
                return client.EduResourceDB
            else:
                raise Exception("No MongoDB URI available")
    except Exception as e:
        print(f"Database connection error: {e}")
        raise

def get_admin_collections():
    """Get admin collections from database"""
    db = get_db_connection()
    return {
        'admin_users': db.admin_users,
        'admin_sessions': db.admin_sessions,
        'admin_logs': db.admin_logs,
        'admin_security': db.admin_security
    }

def admin_required(f):
    """Decorator for admin-only routes"""
    @wraps(f)
    @jwt_required()
    def decorated_function(*args, **kwargs):
        current_user_id = get_jwt_identity()
        user = current_app.config['DB'].admin_users.find_one({'_id': ObjectId(current_user_id)})
        
        if not user or user.get('role') not in ['admin', 'super_admin']:
            return jsonify({'error': 'Admin access required'}), 403
        
        return f(*args, **kwargs)
    return decorated_function

def log_admin_activity(action: str, details: dict, success: bool = True):
    """Log admin activity"""
    try:
        # Try to get current user ID from JWT, but handle cases where it's not available
        current_user_id = None
        try:
            current_user_id = get_jwt_identity()
        except:
            # JWT context not available (e.g., during login attempts)
            pass
            
        log_entry = {
            'admin_id': current_user_id,
            'action': action,
            'details': details,
            'success': success,
            'timestamp': datetime.utcnow(),
            'ip_address': request.remote_addr if request else 'unknown',
            'user_agent': request.headers.get('User-Agent') if request else 'unknown'
        }
        collections = get_admin_collections()
        collections['admin_logs'].insert_one(log_entry)
    except Exception:
        pass

@admin_auth_bp.route('/admin/login', methods=['POST'])
def admin_login():
    """Enhanced admin login with security features"""
    print("🔍 Admin login attempt received")
    
    data = request.get_json()
    if not data:
        print("❌ No JSON data received")
        return jsonify({'error': 'No data provided'}), 400
    
    username = data.get('username')
    password = data.get('password')
    mfa_code = data.get('mfaCode')
    remember_device = data.get('rememberDevice', False)
    device_fingerprint = data.get('deviceFingerprint')
    
    print(f"🔍 Login attempt for username: {username}")
    
    ip_address = request.remote_addr or 'unknown'
    user_agent = request.headers.get('User-Agent', '')
    
    # Validate input
    if not username or not password:
        print("❌ Missing username or password")
        return jsonify({'error': 'Username and password are required'}), 400
    
    # Validate admin username format
    if not SecurityService.validate_admin_username(username):
        print(f"❌ Invalid admin username format: {username}")
        return jsonify({'error': 'Invalid admin username format. Must start with "admin."'}), 400
    
    print(f"✅ Username format valid: {username}")
    
    # Check rate limiting
    if RateLimiter.is_rate_limited(username, ip_address):
        print(f"❌ Rate limited for username: {username}")
        log_admin_activity('login_rate_limited', {
            'username': username,
            'ip_address': ip_address
        }, False)
        return jsonify({'error': 'Account temporarily locked due to too many failed attempts'}), 429
    
    # Find user
    print(f"🔍 Looking for user: {username}")
    collections = get_admin_collections()
    user = collections['admin_users'].find_one({'username': username})
    
    if not user:
        print(f"❌ User not found: {username}")
        RateLimiter.record_attempt(username, ip_address, False)
        log_admin_activity('login_failed', {
            'username': username,
            'reason': 'user_not_found',
            'ip_address': ip_address
        }, False)
        return jsonify({'error': 'Invalid credentials'}), 401
    
    print(f"✅ User found: {username}")
    
    # Check if account is active
    if not user.get('is_active', True):
        print(f"❌ Account disabled: {username}")
        log_admin_activity('login_failed', {
            'username': username,
            'reason': 'account_disabled',
            'ip_address': ip_address
        }, False)
        return jsonify({'error': 'Account is disabled'}), 401
    
    # Verify password
    print(f"🔍 Verifying password for: {username}")
    if not SecurityService.verify_password(password, user['password']):
        print(f"❌ Invalid password for: {username}")
        RateLimiter.record_attempt(username, ip_address, False)
        log_admin_activity('login_failed', {
            'username': username,
            'reason': 'invalid_password',
            'ip_address': ip_address
        }, False)
        return jsonify({'error': 'Invalid credentials'}), 401
    
    print(f"✅ Password verified for: {username}")
    
    # Check MFA if enabled
    if user.get('mfa_enabled', False):
        if not mfa_code:
            return jsonify({
                'requiresMFA': True,
                'message': 'Multi-factor authentication required'
            }), 200
        
        # Verify MFA code
        if not MFAService.verify_totp(user['mfa_secret'], mfa_code):
            # Check backup codes
            backup_codes = user.get('backup_codes', [])
            if mfa_code.upper() not in backup_codes:
                RateLimiter.record_attempt(username, ip_address, False)
                log_admin_activity('login_failed', {
                    'username': username,
                    'reason': 'invalid_mfa',
                    'ip_address': ip_address
                }, False)
                return jsonify({'error': 'Invalid authentication code'}), 401
            else:
                # Remove used backup code
                backup_codes.remove(mfa_code.upper())
                collections['admin_users'].update_one(
                    {'_id': user['_id']},
                    {'$set': {'backup_codes': backup_codes}}
                )
    
    # Successful login
    RateLimiter.record_attempt(username, ip_address, True)
    
    # Create tokens
    if remember_device:
        expires_delta = timedelta(days=30)
    else:
        expires_delta = timedelta(hours=8)
        
    access_token = create_access_token(
        identity=str(user['_id']),
        expires_delta=expires_delta,
        additional_claims={
            'username': username,
            'role': user['role'],
            'permissions': user.get('permissions', [])
        }
    )
    refresh_token = create_refresh_token(identity=str(user['_id']))
    
    # Update last login
    collections['admin_users'].update_one(
        {'_id': user['_id']},
        {
            '$set': {
                'last_login': datetime.utcnow(),
                'last_ip': ip_address,
                'login_attempts': 0
            }
        }
    )
    
    # Create session record
    session_id = str(ObjectId())
    session_data = {
        '_id': ObjectId(session_id),
        'admin_id': str(user['_id']),
        'token': access_token,
        'refresh_token': refresh_token,
        'created_at': datetime.utcnow(),
        'last_activity': datetime.utcnow(),
        'expires_at': datetime.utcnow() + expires_delta,
        'ip_address': ip_address,
        'user_agent': user_agent,
        'device_fingerprint': device_fingerprint,
        'is_active': True,
        'remember_device': remember_device
    }
    collections['admin_sessions'].insert_one(session_data)
    
    # Log successful login
    log_admin_activity('login_success', {
        'username': username,
        'ip_address': ip_address,
        'session_id': session_id,
        'remember_device': remember_device
    })
    
    # Prepare response
    user_data = {
        'id': str(user['_id']),
        'username': user['username'],
        'email': user.get('email'),
        'role': user['role'],
        'permissions': user.get('permissions', []),
        'lastLogin': user.get('last_login'),
        'mfaEnabled': user.get('mfa_enabled', False),
        'department': user.get('department'),
        'firstName': user.get('first_name'),
        'lastName': user.get('last_name'),
        'isActive': user.get('is_active', True)
    }
    
    print(f"🎉 Login successful for: {username}")
    
    return jsonify({
        'user': user_data,
        'token': access_token,
        'refreshToken': refresh_token,
        'expiresIn': int(expires_delta.total_seconds()),
        'permissions': user.get('permissions', []),
        'requiresMFA': False
    }), 200

@admin_auth_bp.route('/admin/logout', methods=['POST'])
@jwt_required()
def admin_logout():
    """Admin logout"""
    current_user_id = get_jwt_identity()
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    
    # Deactivate session
    current_app.config['DB'].admin_sessions.update_one(
        {'admin_id': current_user_id, 'token': token},
        {'$set': {'is_active': False, 'logged_out_at': datetime.utcnow()}}
    )
    
    log_admin_activity('logout', {
        'ip_address': request.remote_addr
    })
    
    return jsonify({'message': 'Logged out successfully'}), 200

@admin_auth_bp.route('/admin/validate', methods=['GET'])
@jwt_required()
def validate_token():
    """Validate admin token"""
    current_user_id = get_jwt_identity()
    user = current_app.config['DB'].admin_users.find_one({'_id': ObjectId(current_user_id)})
    
    if not user or not user.get('is_active', True):
        return jsonify({'error': 'Invalid token'}), 401
    
    user_data = {
        'id': str(user['_id']),
        'username': user['username'],
        'email': user.get('email'),
        'role': user['role'],
        'permissions': user.get('permissions', []),
        'lastLogin': user.get('last_login'),
        'mfaEnabled': user.get('mfa_enabled', False),
        'department': user.get('department'),
        'firstName': user.get('first_name'),
        'lastName': user.get('last_name'),
        'isActive': user.get('is_active', True)
    }
    
    return jsonify(user_data), 200

@admin_auth_bp.route('/admin/mfa/generate', methods=['POST'])
@jwt_required()
def generate_mfa():
    """Generate MFA setup"""
    current_user_id = get_jwt_identity()
    user = current_app.config['DB'].admin_users.find_one({'_id': ObjectId(current_user_id)})
    
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    secret = MFAService.generate_secret()
    qr_code = MFAService.generate_qr_code(user['username'], secret)
    
    # Store secret temporarily (not enabled until verified)
    current_app.config['DB'].admin_users.update_one(
        {'_id': user['_id']},
        {'$set': {'mfa_secret_temp': secret}}
    )
    
    return jsonify({
        'qrCode': qr_code,
        'secret': secret
    }), 200

@admin_auth_bp.route('/admin/mfa/enable', methods=['POST'])
@jwt_required()
def enable_mfa():
    """Enable MFA after verification"""
    current_user_id = get_jwt_identity()
    data = request.get_json()
    mfa_code = data.get('mfaCode')
    secret = data.get('secret')
    
    user = current_app.config['DB'].admin_users.find_one({'_id': ObjectId(current_user_id)})
    
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    # Verify the code
    if not MFAService.verify_totp(secret, mfa_code):
        return jsonify({'error': 'Invalid authentication code'}), 400
    
    # Generate backup codes
    backup_codes = MFAService.generate_backup_codes()
    
    # Enable MFA
    current_app.config['DB'].admin_users.update_one(
        {'_id': user['_id']},
        {
            '$set': {
                'mfa_enabled': True,
                'mfa_secret': secret,
                'backup_codes': backup_codes,
                'mfa_enabled_at': datetime.utcnow()
            },
            '$unset': {'mfa_secret_temp': 1}
        }
    )
    
    log_admin_activity('mfa_enabled', {
        'username': user['username']
    })
    
    return jsonify({
        'backupCodes': backup_codes,
        'message': 'Multi-factor authentication enabled successfully'
    }), 200

@admin_auth_bp.route('/admin/change-password', methods=['POST'])
@jwt_required()
def change_password():
    """Change admin password"""
    current_user_id = get_jwt_identity()
    data = request.get_json()
    current_password = data.get('currentPassword')
    new_password = data.get('newPassword')
    mfa_code = data.get('mfaCode')
    
    user = current_app.config['DB'].admin_users.find_one({'_id': ObjectId(current_user_id)})
    
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    # Verify current password
    if not SecurityService.verify_password(current_password, user['password']):
        log_admin_activity('password_change_failed', {
            'reason': 'invalid_current_password'
        }, False)
        return jsonify({'error': 'Current password is incorrect'}), 400
    
    # Verify MFA if enabled
    if user.get('mfa_enabled', False) and not mfa_code:
        return jsonify({'error': 'MFA code required'}), 400
    
    if user.get('mfa_enabled', False) and not MFAService.verify_totp(user['mfa_secret'], mfa_code):
        return jsonify({'error': 'Invalid MFA code'}), 400
    
    # Validate new password
    validation = SecurityService.validate_strong_password(new_password)
    if not validation['is_valid']:
        return jsonify({
            'error': 'Password does not meet security requirements',
            'details': validation['errors']
        }), 400
    
    # Hash new password
    new_password_hash = SecurityService.hash_password(new_password)
    
    # Update password
    current_app.config['DB'].admin_users.update_one(
        {'_id': user['_id']},
        {
            '$set': {
                'password': new_password_hash,
                'password_changed_at': datetime.utcnow()
            }
        }
    )
    
    # Invalidate all other sessions
    current_app.config['DB'].admin_sessions.update_many(
        {'admin_id': current_user_id, 'is_active': True},
        {'$set': {'is_active': False, 'invalidated_at': datetime.utcnow()}}
    )
    
    log_admin_activity('password_changed', {
        'username': user['username']
    })
    
    return jsonify({'message': 'Password changed successfully'}), 200

# Notification endpoints
@admin_auth_bp.route('/admin/notifications', methods=['GET'])
@jwt_required()
def get_notifications():
    """Get notifications for the current admin user"""
    if not notification_service:
        return jsonify({'error': 'Notification service not available'}), 503
    
    current_user_id = get_jwt_identity()
    unread_only = request.args.get('unread_only', 'false').lower() == 'true'
    limit = int(request.args.get('limit', 50))
    
    try:
        notifications = notification_service.get_notifications(
            admin_id=current_user_id,
            limit=limit,
            unread_only=unread_only
        )
        
        return jsonify({
            'notifications': notifications,
            'unread_count': notification_service.get_unread_count(current_user_id)
        }), 200
        
    except Exception as e:
        print(f"Error getting notifications: {e}")
        return jsonify({'error': 'Failed to get notifications'}), 500

@admin_auth_bp.route('/admin/notifications/<notification_id>/read', methods=['POST'])
@jwt_required()
def mark_notification_read(notification_id):
    """Mark a notification as read"""
    if not notification_service:
        return jsonify({'error': 'Notification service not available'}), 503
    
    current_user_id = get_jwt_identity()
    
    try:
        success = notification_service.mark_as_read(notification_id, current_user_id)
        
        if success:
            return jsonify({'message': 'Notification marked as read'}), 200
        else:
            return jsonify({'error': 'Notification not found'}), 404
            
    except Exception as e:
        print(f"Error marking notification as read: {e}")
        return jsonify({'error': 'Failed to mark notification as read'}), 500

@admin_auth_bp.route('/admin/notifications/read-all', methods=['POST'])
@jwt_required()
def mark_all_notifications_read():
    """Mark all notifications as read"""
    if not notification_service:
        return jsonify({'error': 'Notification service not available'}), 503
    
    current_user_id = get_jwt_identity()
    
    try:
        count = notification_service.mark_all_as_read(current_user_id)
        
        return jsonify({
            'message': f'{count} notifications marked as read',
            'count': count
        }), 200
        
    except Exception as e:
        print(f"Error marking all notifications as read: {e}")
        return jsonify({'error': 'Failed to mark notifications as read'}), 500

@admin_auth_bp.route('/admin/notifications/unread-count', methods=['GET'])
@jwt_required()
def get_unread_count():
    """Get unread notification count"""
    if not notification_service:
        return jsonify({'error': 'Notification service not available'}), 503
    
    current_user_id = get_jwt_identity()
    
    try:
        count = notification_service.get_unread_count(current_user_id)
        
        return jsonify({'unread_count': count}), 200
        
    except Exception as e:
        return jsonify({'error': 'Failed to get unread count'}), 500

@admin_auth_bp.route('/admin/notifications/create', methods=['POST'])
@jwt_required()
def create_notification():
    """Create a new notification"""
    if not notification_service:
        return jsonify({'error': 'Notification service not available'}), 503
    
    current_user_id = get_jwt_identity()
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    try:
        notification_id = notification_service.create_notification(
            admin_id=current_user_id,
            type=data.get('type', 'system_alert'),
            title=data.get('title', 'Notification'),
            message=data.get('message', ''),
            data=data.get('data', {})
        )
        
        return jsonify({
            'message': 'Notification created successfully',
            'notification_id': notification_id
        }), 201
        
    except Exception as e:
        print(f"Error creating notification: {e}")
        return jsonify({'error': 'Failed to create notification'}), 500 