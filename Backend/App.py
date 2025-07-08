from flask import Flask
from flask_cors import CORS
from pymongo import MongoClient
import os
from auth import auth_bp
from routes import routes_bp
from dotenv import load_dotenv
from manage_resources import manage_resources_bp
from flask_jwt_extended import JWTManager
load_dotenv()

app = Flask(__name__)

app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET', 'your-default-secret-key')

        


jwt = JWTManager(app)

CORS(app, supports_credentials=True, resources={r"/*": {"origins": "http://localhost:4200"}})


# MongoDB Atlas Configuration
MONGO_URI= os.getenv('MONGO_URI')
print("MONGO_URI:", MONGO_URI)
client= MongoClient(MONGO_URI)
db=client.EduResourceDB




app.register_blueprint(auth_bp, url_prefix='/api')
app.register_blueprint(routes_bp)
app.register_blueprint(manage_resources_bp, url_prefix='/api')

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)