
import os
import sys
import logging
from app import app
from migrations import run_migrations
from logging_config import setup_logging

def startup_checks():
    """Perform startup checks and initialization"""
    logger = logging.getLogger(__name__)
    
    # Check required environment variables
    required_vars = ['MONGO_URI', 'JWT_SECRET', 'SECRET_KEY']
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    
    if missing_vars:
        logger.error(f"❌ Missing required environment variables: {missing_vars}")
        sys.exit(1)
    
    # Run database migrations
    try:
        run_migrations()
    except Exception as e:
        logger.error(f"❌ Database migration failed: {e}")
        sys.exit(1)
    
    logger.info("✅ Startup checks completed successfully")

if __name__ == "__main__":
    # Setup logging
    setup_logging(app)
    
    # Run startup checks
    startup_checks()
    
    # Start the application
    port = int(os.getenv('PORT', 8000))
    app.run(host='0.0.0.0', port=port, debug=False)
