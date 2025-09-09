
import os
import sys
import logging

logger = logging.getLogger(__name__)

def validate_environment():
    """Validate all required environment variables"""
    
    required_vars = {
        'MONGO_URI': 'MongoDB connection string',
        'JWT_SECRET': 'JWT secret key for token signing',
        'SECRET_KEY': 'Flask secret key',
        'FLASK_ENV': 'Flask environment (production/development)',
        'ADMIN_EMAIL': 'Administrator email address',
        'ADMIN_FIRST_NAME': 'Administrator first name',
        'ADMIN_LAST_NAME': 'Administrator last name'
    }
    
    optional_vars = {
        'PORT': '5000',
        'JWT_EXPIRATION': '1d',
        'CONFLICT_SCAN_INTERVAL': '3600',
        'ALLOWED_ORIGINS': 'https://yourdomain.com',
        'MANAGER_EMAIL': 'manager@yourdomain.com',
        'SUPER_ADMIN_PASSWORD': 'Please set a secure password',
        'ADMIN_PASSWORD': 'Please set a secure password'
    }
    
    errors = []
    warnings = []
    
    # Check required variables
    for var, description in required_vars.items():
        value = os.getenv(var)
        if not value:
            errors.append(f"❌ {var}: {description}")
        else:
            logger.info(f"✅ {var}: Set")
    
    # Check optional variables
    for var, default in optional_vars.items():
        value = os.getenv(var)
        if not value:
            warnings.append(f"⚠️ {var}: Not set, using default: {default}")
            os.environ[var] = default
        else:
            logger.info(f"✅ {var}: Set")
    
    # Validate specific values
    validate_specific_configs(warnings)
    
    # Print results
    if errors:
        logger.error("Environment validation failed:")
        for error in errors:
            logger.error(error)
        sys.exit(1)
    
    if warnings:
        logger.warning("Environment warnings:")
        for warning in warnings:
            logger.warning(warning)
    
    logger.info("🎯 Environment validation completed")

def validate_specific_configs(warnings):
    """Validate specific configuration values"""
    
    # Check JWT_SECRET strength
    jwt_secret = os.getenv('JWT_SECRET')
    if jwt_secret and len(jwt_secret) < 32:
        warnings.append("⚠️ JWT_SECRET should be at least 32 characters long")
    
    # Check if using default passwords in production
    if os.getenv('FLASK_ENV') == 'production':
        if os.getenv('SUPER_ADMIN_PASSWORD') == 'AdminPass123!':
            warnings.append("⚠️ Using default SUPER_ADMIN_PASSWORD in production")
        if os.getenv('ADMIN_PASSWORD') == 'AdminPass123!':
            warnings.append("⚠️ Using default ADMIN_PASSWORD in production")
    
    # Validate PORT
    try:
        port = int(os.getenv('PORT', 5000))
        if port < 1 or port > 65535:
            warnings.append("⚠️ PORT should be between 1 and 65535")
    except ValueError:
        warnings.append("⚠️ PORT should be a valid integer")

if __name__ == "__main__":
    validate_environment()
