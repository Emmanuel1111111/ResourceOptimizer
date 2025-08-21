#!/usr/bin/env python3


import sys
import signal
import time
from conflict_detector import conflict_detector
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def signal_handler(sig, frame):
    """Handle shutdown signals gracefully"""
    
    conflict_detector.stop_monitoring()
    sys.exit(0)

def main():
    """Main function to start conflict monitoring"""
    
    # Register signal handlers for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        # Start the conflict monitoring
        conflict_detector.start_monitoring()
        
        
        # Keep the main thread alive
        while True:
            time.sleep(1)
            
    except KeyboardInterrupt:
      
        conflict_detector.stop_monitoring()
    except Exception as e:
       
        conflict_detector.stop_monitoring()
        sys.exit(1)

if __name__ == "__main__":
    main()
