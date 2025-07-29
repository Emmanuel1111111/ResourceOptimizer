#!/usr/bin/env python3
"""
Script to update admin.manager user permissions to include booking:create
"""

import os
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

def update_admin_permissions():
    """Update admin.manager user permissions"""
    
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
        
        # Find the admin.manager user
        user = admin_users_collection.find_one({'username': 'admin.manager'})
        
        if not user:
            print("❌ admin.manager user not found")
            return
        
        print(f"✅ Found user: {user['username']}")
        print(f"Current permissions: {user['permissions']}")
        
        # Update permissions to include 'create' action for booking
        updated_permissions = []
        for permission in user['permissions']:
            if permission['resource'] == 'booking':
                # Add 'create' action if not already present
                actions = permission['actions']
                if 'create' not in actions:
                    actions.append('create')
                    print(f"✅ Added 'create' action to booking permissions")
                updated_permissions.append({'resource': 'booking', 'actions': actions})
            else:
                updated_permissions.append(permission)
        
        # Update the user
        result = admin_users_collection.update_one(
            {'username': 'admin.manager'},
            {'$set': {'permissions': updated_permissions}}
        )
        
        if result.modified_count > 0:
            print("✅ Successfully updated admin.manager permissions!")
            print(f"New permissions: {updated_permissions}")
        else:
            print("⚠️ No changes were made (permissions already up to date)")
        
    except Exception as e:
        print(f"❌ Error updating admin permissions: {e}")

if __name__ == "__main__":
    update_admin_permissions() 