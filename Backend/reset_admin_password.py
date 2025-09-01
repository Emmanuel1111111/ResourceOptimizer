
import os
import bcrypt
from datetime import datetime
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

def reset_admin_password():
    MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/EduResourceDB")
    client = MongoClient(MONGO_URI)
    db = client.EduResourceDB
    
    # Set a known password
    new_password = "AdminPass123!"
    
    print(f"🔄 Resetting password for admin.super...")
    print(f"🔑 New password will be: {new_password}")
    
    # Hash the password properly
    salt = bcrypt.gensalt()
    hashed_password = bcrypt.hashpw(new_password.encode('utf-8'), salt).decode('utf-8')
    
    print(f"🔐 Generated hash: {hashed_password[:20]}...")
    
    # Update the user
    result = db.admin_users.update_one(
        {'username': 'admin.super'},
        {
            '$set': {
                'password': hashed_password,
                'password_changed_at': datetime.utcnow(),
                'login_attempts': 0  # Reset login attempts
            }
        }
    )
    
    if result.modified_count > 0:
        print("✅ Password updated successfully!")
        
        # Verify the update worked
        user = db.admin_users.find_one({'username': 'admin.super'})
        test_verify = bcrypt.checkpw(new_password.encode('utf-8'), user['password'].encode('utf-8'))
        print(f"🧪 Verification test: {'✅ SUCCESS' if test_verify else '❌ FAILED'}")
        
        if test_verify:
            print(f"\n🎉 SUCCESS! You can now login with:")
            print(f"   Username: admin.super")
            print(f"   Password: {new_password}")
        
    else:
        print("❌ Failed to update password - user might not exist")

if __name__ == "__main__":
    reset_admin_password()
