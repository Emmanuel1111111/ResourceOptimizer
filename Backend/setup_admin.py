#!/usr/bin/env python3
"""
Setup script to create initial admin users for testing
"""

import os
import bcrypt
from pymongo import MongoClient
from bson import ObjectId
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

def setup_admin_users():
    """Create initial admin users"""
    
    # Connect to MongoDB
    MONGO_URI = os.getenv("MONGO_URI")
    if not MONGO_URI:
        print("❌ MONGO_URI not found in environment variables")
        return
    
    try:
        client = MongoClient(MONGO_URI)
        db = client.EduResourceDB
        admin_users_collection = db.admin_users
        
        print("🔗 Connected to MongoDB")
        
        # Check if admin users already exist
        existing_admin = admin_users_collection.find_one({'username': 'admin.super'})
        if existing_admin:
            print("✅ Admin user already exists")
            return
        
        # Create super admin user
        admin_password = "Admin123!@#"  # Change this in production
        hashed_password = bcrypt.hashpw(admin_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        admin_user = {
            '_id': ObjectId(),
            'username': 'admin.super',
            'email': 'admin@resourceoptimizer.com',
            'password': hashed_password,
            'role': 'super_admin',
            'permissions': [
                {'resource': '*', 'actions': ['*']}  # All permissions
            ],
            'first_name': 'Super',
            'last_name': 'Administrator',
            'department': 'IT',
            'is_active': True,
            'mfa_enabled': False,
            'login_attempts': 0,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        
        # Insert admin user
        result = admin_users_collection.insert_one(admin_user)
        
        print("✅ Admin user created successfully!")
        print(f"   Username: admin.super")
        print(f"   Password: {admin_password}")
        print(f"   Role: super_admin")
        print(f"   ID: {result.inserted_id}")
        
        # Create regular admin user
        regular_admin_password = "Admin456!@#"
        hashed_password2 = bcrypt.hashpw(regular_admin_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        regular_admin = {
            '_id': ObjectId(),
            'username': 'admin.manager',
            'email': 'manager@resourceoptimizer.com',
            'password': hashed_password2,
            'role': 'admin',
            'permissions': [
                {'resource': 'resources', 'actions': ['read', 'write']},
                {'resource': 'schedules', 'actions': ['read', 'write']},
                {'resource': 'booking', 'actions': ['read', 'write', 'create']},  # Added 'create' action
                {'resource': 'analytics', 'actions': ['read']}
            ],
            'first_name': 'Resource',
            'last_name': 'Manager',
            'department': 'Operations',
            'is_active': True,
            'mfa_enabled': False,
            'login_attempts': 0,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        
        result2 = admin_users_collection.insert_one(regular_admin)
        
        print("✅ Regular admin user created successfully!")
        print(f"   Username: admin.manager")
        print(f"   Password: {regular_admin_password}")
        print(f"   Role: admin")
        print(f"   ID: {result2.inserted_id}")
        
        print("\n🎉 Admin users setup complete!")
        print("You can now login with either account:")
        print("1. admin.super / Admin123!@# (Super Admin)")
        print("2. admin.manager / Admin456!@# (Regular Admin)")
        
    except Exception as e:
        print(f"❌ Error setting up admin users: {e}")
        print("Make sure MongoDB is running and MONGO_URI is correct")

if __name__ == "__main__":
    setup_admin_users() 