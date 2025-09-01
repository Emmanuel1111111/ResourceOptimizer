
import os
import bcrypt
import secrets
import string
import logging
from pymongo import MongoClient
from bson import ObjectId
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def generate_secure_password(length=16):
    """Generate a cryptographically secure password"""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    password = ''.join(secrets.choice(alphabet) for _ in range(length))
    return password 

def setup_admin_users():
   
    
    # Validate required environment variables
    required_env_vars = ['MONGO_URI', 'ADMIN_EMAIL', 'ADMIN_FIRST_NAME', 'ADMIN_LAST_NAME']
    missing_vars = [var for var in required_env_vars if not os.getenv(var)]
    
    if missing_vars:
        logger.error(f"❌ Missing required environment variables: {', '.join(missing_vars)}")
        return False
    
    MONGO_URI = os.getenv("MONGO_URI")
    ADMIN_EMAIL = os.getenv("ADMIN_EMAIL")
    ADMIN_FIRST_NAME = os.getenv("ADMIN_FIRST_NAME")
    ADMIN_LAST_NAME = os.getenv("ADMIN_LAST_NAME")
    
    SUPER_ADMIN_PASSWORD = os.getenv("SUPER_ADMIN_PASSWORD") or generate_secure_password(20)
    ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD") or generate_secure_password(18)
    
    try:
        client = MongoClient(MONGO_URI)
        db = client.EduResourceDB
        admin_users_collection = db.admin_users
        
        logger.info("🔗 Connected to MongoDB")
        admin_users_collection.delete_many({})  
        
        # Check if admin users already exist
        existing_admin = admin_users_collection.find_one({'username': 'admin.super'})
        if existing_admin:
            logger.info("✅ Admin user already exists")
            return True
        
        # Create super admin user with enhanced security
        hashed_password = bcrypt.hashpw(SUPER_ADMIN_PASSWORD.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        admin_user = {
            '_id': ObjectId(),
            'username': 'admin.super',
            'email': ADMIN_EMAIL,
            'password': hashed_password,
            'role': 'super_admin',
            'permissions': [
                {'resource': '*', 'actions': ['*']}
            ],
            'first_name': ADMIN_FIRST_NAME,
            'last_name': ADMIN_LAST_NAME,
            'department': 'IT',
            'is_active': True,
            'mfa_enabled': True,  # Force MFA for production
            'login_attempts': 0,
            'account_locked': False,
            'password_expires_at': None,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow(),
            'last_password_change': datetime.utcnow()
        }
        
        result = admin_users_collection.insert_one(admin_user)
        
        logger.info("✅ Super admin user created successfully!")
        logger.info(f"   Username: admin.super")
        logger.info(f"   Email: {ADMIN_EMAIL}")
        logger.info(f"   Role: super_admin")
        logger.info(f"   ID: {result.inserted_id}")
        
        # Only log password in development
        if os.getenv('ENVIRONMENT') == 'development':
            logger.info(f"   Password: {SUPER_ADMIN_PASSWORD}")
        else:
            logger.info("   Password: [Generated - Check secure storage]")
        
        # Create regular admin user
        manager_email = os.getenv("MANAGER_EMAIL", f"manager@{ADMIN_EMAIL.split('@')[1]}")
        hashed_password2 = bcrypt.hashpw(ADMIN_PASSWORD.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        regular_admin = {
            '_id': ObjectId(),
            'username': 'admin.manager',
            'email': manager_email,
            'password': hashed_password2,
            'role': 'admin',
            'permissions': [
                {'resource': 'resources', 'actions': ['read', 'write']},
                {'resource': 'schedules', 'actions': ['read', 'write']},
                {'resource': 'booking', 'actions': ['read', 'write', 'create']},
                {'resource': 'analytics', 'actions': ['read']}
            ],
            'first_name': 'Resource',
            'last_name': 'Manager',
            'department': 'Operations',
            'is_active': True,
            'mfa_enabled': True,
            'login_attempts': 0,
            'account_locked': False,
            'password_expires_at': None,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow(),
            'last_password_change': datetime.utcnow()
        }
        
        result2 = admin_users_collection.insert_one(regular_admin)
        
        logger.info("✅ Regular admin user created successfully!")
        logger.info(f"   Username: admin.manager")
        logger.info(f"   Email: {manager_email}")
        logger.info(f"   Role: admin")
        logger.info(f"   ID: {result2.inserted_id}")
        
        if os.getenv('ENVIRONMENT') == 'development':
            logger.info(f"   Password: {ADMIN_PASSWORD}")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Error setting up admin users: {e}")
        return False

if __name__ == "__main__":
    success = setup_admin_users()
    if not success:
        exit(1)