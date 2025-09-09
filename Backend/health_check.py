
import os
import pymongo
from flask import jsonify
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

def create_health_check(app, db):
    """Enhanced health check for production monitoring"""
    
    @app.route('/health')
    def health_check():
        health_status = {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "version": "1.0.0",
            "environment": os.getenv('FLASK_ENV', 'development'),
            "checks": {}
        }
        
        # Database connectivity check
        try:
            if db is not None:
                db.admin.command('ping')
                health_status["checks"]["database"] = {
                    "status": "healthy",
                    "message": "MongoDB connection successful"
                }
            else:
                health_status["checks"]["database"] = {
                    "status": "unhealthy",
                    "message": "Database connection not available"
                }
                health_status["status"] = "unhealthy"
        except Exception as e:
            health_status["checks"]["database"] = {
                "status": "unhealthy",
                "message": f"Database error: {str(e)}"
            }
            health_status["status"] = "unhealthy"
        
        # Environment variables check
        required_vars = ['MONGO_URI', 'JWT_SECRET', 'SECRET_KEY']
        missing_vars = [var for var in required_vars if not os.getenv(var)]
        
        if missing_vars:
            health_status["checks"]["environment"] = {
                "status": "unhealthy",
                "message": f"Missing environment variables: {missing_vars}"
            }
            health_status["status"] = "unhealthy"
        else:
            health_status["checks"]["environment"] = {
                "status": "healthy",
                "message": "All required environment variables present"
            }
        
        # Return appropriate status code
        status_code = 200 if health_status["status"] == "healthy" else 503
        return jsonify(health_status), status_code
    
    @app.route('/ready')
    def readiness_check():
        """Kubernetes/Railway readiness probe"""
        try:
            if db is not None:
                db.admin.command('ping')
                return jsonify({"status": "ready"}), 200
            else:
                return jsonify({"status": "not ready", "reason": "database unavailable"}), 503
        except Exception as e:
            return jsonify({"status": "not ready", "reason": str(e)}), 503
    
    @app.route('/live')
    def liveness_check():
        """Kubernetes/Railway liveness probe"""
        return jsonify({"status": "alive", "timestamp": datetime.utcnow().isoformat()}), 200
