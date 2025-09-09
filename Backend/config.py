
import os
from datetime import timedelta

class Config:
    # MongoDB Configuration
    MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017/EduResourceDB')
    
    # JWT Configuration
    JWT_SECRET_KEY = os.getenv('JWT_SECRET', 'your-secret-key')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)
    
    # Conflict Detection Configuration
    CONFLICT_SCAN_INTERVAL = int(os.getenv('CONFLICT_SCAN_INTERVAL', '3600'))
    
    # Flask Configuration
    SECRET_KEY = os.getenv('SECRET_KEY', 'your-flask-secret')
    
    # Railway specific
    PORT = int(os.getenv('PORT', 5000))
    
class ProductionConfig(Config):
    DEBUG = False
    TESTING = False
    
class DevelopmentConfig(Config):
    DEBUG = True
    TESTING = False

# Configuration selector
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}
