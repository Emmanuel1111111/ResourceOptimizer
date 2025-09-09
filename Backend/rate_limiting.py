
from flask import request, jsonify
from functools import wraps
import time
from collections import defaultdict, deque
import logging

logger = logging.getLogger(__name__)

class RateLimiter:
    def __init__(self):
        self.requests = defaultdict(deque)
        self.blocked_ips = defaultdict(float)
    
    def is_rate_limited(self, ip, limit=100, window=3600, block_duration=300):
        """Check if IP is rate limited"""
        current_time = time.time()
        
        # Check if IP is currently blocked
        if ip in self.blocked_ips:
            if current_time < self.blocked_ips[ip]:
                return True
            else:
                del self.blocked_ips[ip]
        
        # Clean old requests
        while self.requests[ip] and self.requests[ip][0] < current_time - window:
            self.requests[ip].popleft()
        
        # Check rate limit
        if len(self.requests[ip]) >= limit:
            # Block IP
            self.blocked_ips[ip] = current_time + block_duration
            logger.warning(f"Rate limit exceeded for IP {ip}. Blocked for {block_duration} seconds.")
            return True
        
        # Add current request
        self.requests[ip].append(current_time)
        return False

rate_limiter = RateLimiter()

def rate_limit(limit=100, window=3600):
    """Rate limiting decorator"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            ip = request.environ.get('HTTP_X_FORWARDED_FOR', request.remote_addr)
            
            if rate_limiter.is_rate_limited(ip, limit, window):
                return jsonify({
                    "status": "error",
                    "error": "Rate limit exceeded",
                    "message": "Too many requests. Please try again later."
                }), 429
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator
