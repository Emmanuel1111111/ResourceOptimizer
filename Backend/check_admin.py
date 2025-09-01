
import os
import bcrypt
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

def check_admin_password():
    MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/EduResourceDB")
    client = MongoClient(MONGO_URI)
    db = client.EduResourceDB
    
    user = db.admin_users.find_one({'username': 'admin.super'})
    
    if user:
        print(f"✅ Found user: {user['username']}")
        print(f"📧 Email: {user.get('email', 'N/A')}")
        print(f"🔐 Role: {user.get('role', 'N/A')}")
        print(f"🔑 Password hash length: {len(user.get('password', ''))}")
        print(f"🔑 Password hash starts with: {user.get('password', '')[:10]}...")
        
        # Test with the expected password
        test_password = "AdminPass123!"
        stored_hash = user.get('password', '')
        
        print(f"\n🧪 Testing password: '{test_password}'")
        
        try:
            # Test bcrypt verification
            is_valid = bcrypt.checkpw(test_password.encode('utf-8'), stored_hash.encode('utf-8'))
            print(f"🧪 Bcrypt verification: {'✅ SUCCESS' if is_valid else '❌ FAILED'}")
        except Exception as e:
            print(f"❌ Bcrypt error: {e}")
            
        # Also test if it might be a plain text password (security issue but let's check)
        if stored_hash == test_password:
            print("⚠️  WARNING: Password appears to be stored as plain text!")
            
    else:
        print("❌ User 'admin.super' not found in database")

if __name__ == "__main__":
    check_admin_password()
