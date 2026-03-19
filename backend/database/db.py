import os

from pymongo import MongoClient

# Connect to local MongoDB
mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
client = MongoClient(mongo_uri)

# Create database
db = client["efps_database"]

# Create collection
students_collection = db["students"]
teachers_collection = db["teachers"]

print("✅ Connected to Local MongoDB")