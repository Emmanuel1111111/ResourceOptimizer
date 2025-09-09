
import os
import pymongo
from pymongo import MongoClient
import logging

logger = logging.getLogger(__name__)

def get_database_connection():
    """Get MongoDB connection with error handling"""
    try:
        mongo_uri = os.getenv('MONGO_URI')
        if not mongo_uri:
            logger.error("MONGO_URI environment variable not set")
            return None, None
            
        client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
        
        # Test the connection
        client.admin.command('ping')
        
        db = client['EduResourceDB']
        logger.info("✅ MongoDB connection successful")
        
        return client, db
        
    except pymongo.errors.ServerSelectionTimeoutError:
        logger.error("❌ MongoDB connection timeout")
        return None, None
    except pymongo.errors.ConnectionFailure:
        logger.error("❌ MongoDB connection failed")
        return None, None
    except Exception as e:
        logger.error(f"❌ Unexpected database error: {str(e)}")
        return None, None

# Initialize global connection
client, db = get_database_connection()
