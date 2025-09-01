
import os
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

def disable_mfa():
    MONGO_URI = os.getenv("MONGO_URI")
    client = MongoClient(MONGO_URI)
    db = client.EduResourceDB
    
    admin_username = "admin.super"  # Replace with your username
    
    result = db.admin_users.update_one(
        {'username': admin_username},
        {'$set': {'mfa_enabled': False}}
    )
    
    if result.modified_count > 0:
        print("✅ MFA disabled successfully")
    else:
        print("❌ User not found or MFA already disabled")

if __name__ == "__main__":
    disable_mfa()
