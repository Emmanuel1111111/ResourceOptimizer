#!/usr/bin/env python3
"""
Real-time Notification Service for Admin Dashboard
"""

import os
from datetime import datetime, timedelta
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv
from typing import Dict, List, Optional
from enum import Enum

load_dotenv()

class NotificationType(Enum):
    BOOKING_CREATED = "booking_created"
    BOOKING_UPDATED = "booking_updated"
    BOOKING_CANCELLED = "booking_cancelled"
    ROOM_OVERBOOKED = "room_overbooked"
    SCHEDULE_CONFLICT = "schedule_conflict"
    SYSTEM_ALERT = "system_alert"

class NotificationService:
    def __init__(self):
        self.mongo_uri = os.getenv("MONGO_URI")
        self.client = MongoClient(self.mongo_uri)
        self.db = self.client.EduResourceDB
        self.notifications_collection = self.db.admin_notifications
        
        # Create indexes
        self.notifications_collection.create_index([("admin_id", 1), ("created_at", -1)])
        self.notifications_collection.create_index([("read", 1)])
    
    def create_notification(self, admin_id: str, type: str, title: str, message: str, data: Dict = None) -> str:
        """Create a new notification"""
        notification = {
            "_id": ObjectId(),
            "admin_id": admin_id,
            "type": type,
            "title": title,
            "message": message,
            "data": data or {},
            "read": False,
            "created_at": datetime.utcnow(),
            "is_active": True
        }
        
        result = self.notifications_collection.insert_one(notification)
        return str(result.inserted_id)
    
    def get_notifications(self, admin_id: str, limit: int = 50, unread_only: bool = False) -> List[Dict]:
        
        query = {"admin_id": admin_id, "is_active": True}
        
        if unread_only:
            query["read"] = False
        
        cursor = self.notifications_collection.find(query).sort("created_at", -1).limit(limit)
        notifications = []
        
        for doc in cursor:
            notifications.append({
                "id": str(doc["_id"]),
                "type": doc["type"],
                "title": doc["title"],
                "message": doc["message"],
                "data": doc.get("data", {}),
                "read": doc["read"],
                "created_at": doc["created_at"].isoformat(),
                "time_ago": self._get_time_ago(doc["created_at"])
            })
        
        return notifications
    
    def mark_as_read(self, notification_id: str, admin_id: str) -> bool:
        """Mark a notification as read"""
        result = self.notifications_collection.update_one(
            {"_id": ObjectId(notification_id), "admin_id": admin_id},
            {"$set": {"read": True, "read_at": datetime.utcnow()}}
        )
        return result.modified_count > 0
    
    def mark_all_as_read(self, admin_id: str) -> int:
        """Mark all notifications as read"""
        result = self.notifications_collection.update_many(
            {"admin_id": admin_id, "read": False},
            {"$set": {"read": True, "read_at": datetime.utcnow()}}
        )
        return result.modified_count
    
    def get_unread_count(self, admin_id: str) -> int:
        """Get count of unread notifications"""
        return self.notifications_collection.count_documents({
            "admin_id": admin_id,
            "read": False,
            "is_active": True
        })
    
    def _get_time_ago(self, created_at: datetime) -> str:
        """Get human-readable time ago string"""
        now = datetime.utcnow()
        diff = now - created_at
        
        if diff.days > 0:
            return f"{diff.days} day{'s' if diff.days > 1 else ''} ago"
        elif diff.seconds > 3600:
            hours = diff.seconds // 3600
            return f"{hours} hour{'s' if hours > 1 else ''} ago"
        elif diff.seconds > 60:
            minutes = diff.seconds // 60
            return f"{minutes} minute{'s' if minutes > 1 else ''} ago"
        else:
            return "Just now"

# Global notification service instance
notification_service = NotificationService() 