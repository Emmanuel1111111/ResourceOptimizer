
import logging
import os
from logging.handlers import RotatingFileHandler

def setup_logging(app):
    """Configure logging for production"""
    
    if not app.debug:
        # Create logs directory if it doesn't exist
        if not os.path.exists('logs'):
            os.mkdir('logs')
            
        # File handler for errors
        file_handler = RotatingFileHandler(
            'logs/resourceoptimizer.log', 
            maxBytes=10240000, 
            backupCount=10
        )
        file_handler.setFormatter(logging.Formatter(
            '%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'
        ))
        file_handler.setLevel(logging.INFO)
        app.logger.addHandler(file_handler)
        
        app.logger.setLevel(logging.INFO)
        app.logger.info('ResourceOptimizer startup')
