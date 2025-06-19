
import pandas as pd
from pymongo import MongoClient 
import os
from dotenv import load_dotenv
load_dotenv()
# MongoDB Atlas Connection
MONGO_URI = os.getenv("MONGO_URI")
client = MongoClient(MONGO_URI)
db = client.EduResourceDB
timetables_collection = db.timetables


# Clear the collection before inserting new data
timetables_collection.delete_many({})  

csv_file = "room_data_large.csv"  
try:
    df = pd.read_csv(csv_file)
except FileNotFoundError:
    print(f"Error: File {csv_file} not found. Please check the path.")
    exit(1)

# Strip whitespace from column names
df.columns = df.columns.str.strip()

# Convert DataFrame to list of dictionaries
records = df.to_dict('records')

# Insert into MongoDB
try:
    result = timetables_collection.insert_many(records, ordered=False)
    print(f"Inserted {len(result.inserted_ids)} documents into timetables collection")
except Exception as e:
    print(f"Error importing data: {str(e)}")

# Close connection
client.close()