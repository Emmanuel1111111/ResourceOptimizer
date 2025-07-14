from pymongo import MongoClient
from dotenv import load_dotenv
import os
import sys
import socket
import dns.resolver
import time

# Load environment variables
load_dotenv()
MONGO_URI = os.getenv("MONGO_URI")

print("=== MongoDB Connection Test ===")
print(f"Python version: {sys.version}")
print(f"MongoDB URI: {'*****' + MONGO_URI[-20:] if MONGO_URI else 'Not set'}")

# Test DNS resolution
if MONGO_URI and 'mongodb+srv://' in MONGO_URI:
    try:
        hostname = MONGO_URI.split('@')[1].split('/')[0]
        print(f"\nTesting DNS resolution for: {hostname}")
        
        # Try to resolve DNS
        try:
            answers = dns.resolver.resolve(hostname, 'A')
            print(f"DNS resolution successful. IP addresses: {[rdata.address for rdata in answers]}")
        except dns.resolver.NXDOMAIN:
            print(f"DNS Error: Domain {hostname} does not exist")
        except dns.resolver.NoNameservers:
            print(f"DNS Error: No nameservers available for {hostname}")
        except dns.resolver.NoAnswer:
            print(f"DNS Error: No answer for {hostname}")
        except Exception as dns_err:
            print(f"DNS Error: {type(dns_err).__name__}: {dns_err}")
    except Exception as e:
        print(f"Error parsing hostname: {e}")

# Test basic connectivity
if MONGO_URI:
    try:
        print("\nTesting MongoDB connection...")
        start_time = time.time()
        
        # Try with direct connection first
        try:
            client = MongoClient(MONGO_URI, directConnection=True, serverSelectionTimeoutMS=5000)
            client.server_info()  # Will raise an exception if connection fails
            print("✓ Connection successful with directConnection=True")
        except Exception as direct_err:
            print(f"✗ Connection failed with directConnection=True: {type(direct_err).__name__}: {direct_err}")
            
            # Try without direct connection
            try:
                print("\nTrying without directConnection...")
                client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
                client.server_info()
                print("✓ Connection successful without directConnection")
            except Exception as std_err:
                print(f"✗ Connection failed without directConnection: {type(std_err).__name__}: {std_err}")
        
        end_time = time.time()
        print(f"Connection test took {end_time - start_time:.2f} seconds")
    except Exception as e:
        print(f"Error during connection test: {type(e).__name__}: {e}")
else:
    print("\n❌ MONGO_URI environment variable is not set!")
    print("Please check your .env file and make sure MONGO_URI is properly configured.")

# Test local MongoDB connection
print("\nTesting local MongoDB connection...")
try:
    local_client = MongoClient('mongodb://localhost:27017/', serverSelectionTimeoutMS=2000)
    local_client.server_info()
    print("✓ Local MongoDB connection successful")
except Exception as local_err:
    print(f"✗ Local MongoDB connection failed: {type(local_err).__name__}: {local_err}")

print("\n=== Connection Test Complete ===") 