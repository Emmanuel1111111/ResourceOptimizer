#!/usr/bin/env python3
"""
Test script for the notification system
"""

import os
import sys
from datetime import datetime
from dotenv import load_dotenv
from pymongo import MongoClient
from bson import ObjectId

# Add the current directory to the path so we can import our modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from notification_service import notification_service, NotificationType

load_dotenv()

def test_notification_system():
    """Test the notification system"""
    print("🧪 Testing Notification System...")
    
    # Test admin user ID (you can replace this with an actual admin user ID from your database)
    test_admin_id = "6883552709635bc589cddbe6"  # admin.manager user ID
    
    try:
        # Test 1: Create a notification
        print("\n1. Creating test notification...")
        notification_id = notification_service.create_notification(
            admin_id=test_admin_id,
            type=NotificationType.BOOKING_CREATED.value,
            title="Test Executive Booking",
            message="Test notification for executive booking operation",
            data={"room_id": "SCB-SF20", "operation": "test"}
        )
        print(f"✅ Notification created with ID: {notification_id}")
        
        # Test 2: Get notifications
        print("\n2. Fetching notifications...")
        notifications = notification_service.get_notifications(test_admin_id)
        print(f"✅ Found {len(notifications)} notifications")
        
        for notification in notifications:
            print(f"   - {notification['title']}: {notification['message']}")
        
        # Test 3: Get unread count
        print("\n3. Getting unread count...")
        unread_count = notification_service.get_unread_count(test_admin_id)
        print(f"✅ Unread notifications: {unread_count}")
        
        # Test 4: Mark as read
        if notifications:
            print("\n4. Marking notification as read...")
            success = notification_service.mark_as_read(notifications[0]['id'], test_admin_id)
            print(f"✅ Mark as read: {success}")
        
        # Test 5: Mark all as read
        print("\n5. Marking all notifications as read...")
        count = notification_service.mark_all_as_read(test_admin_id)
        print(f"✅ Marked {count} notifications as read")
        
        print("\n🎉 All notification tests passed!")
        
    except Exception as e:
        print(f"❌ Error testing notification system: {e}")
        return False
    
    return True

def create_sample_notifications():
    """Create sample notifications for testing"""
    print("\n📝 Creating sample notifications...")
    
    # Test admin user ID
    test_admin_id = "6883552709635bc589cddbe6"
    
    sample_notifications = [
        {
            "type": NotificationType.BOOKING_CREATED.value,
            "title": "New Executive Booking",
            "message": "Executive booking created for SCB-SF20 on 2025-01-27",
            "data": {"room_id": "SCB-SF20", "date": "2025-01-27", "time": "09:00-11:00"}
        },
        {
            "type": NotificationType.BOOKING_UPDATED.value,
            "title": "Booking Updated",
            "message": "Executive booking updated for SCB-SF21",
            "data": {"room_id": "SCB-SF21", "changes": ["time", "date"]}
        },
        {
            "type": NotificationType.ROOM_OVERBOOKED.value,
            "title": "Room Overbooking Alert",
            "message": "Room SCB-SF20 has overlapping bookings",
            "data": {"room_id": "SCB-SF20", "conflicts": 2}
        },
        {
            "type": NotificationType.SYSTEM_ALERT.value,
            "title": "System Maintenance",
            "message": "Scheduled maintenance in 30 minutes",
            "data": {"maintenance_type": "database", "duration": "2 hours"}
        }
    ]
    
    created_count = 0
    for notification_data in sample_notifications:
        try:
            notification_service.create_notification(
                admin_id=test_admin_id,
                type=notification_data["type"],
                title=notification_data["title"],
                message=notification_data["message"],
                data=notification_data["data"]
            )
            created_count += 1
            print(f"✅ Created: {notification_data['title']}")
        except Exception as e:
            print(f"❌ Failed to create: {notification_data['title']} - {e}")
    
    print(f"\n📊 Created {created_count} sample notifications")

if __name__ == "__main__":
    print("🚀 Starting Notification System Tests...")
    
    # Run basic tests
    if test_notification_system():
        # Create sample notifications
        create_sample_notifications()
        
        print("\n🎯 Test completed successfully!")
        print("\nTo view notifications in the admin dashboard:")
        print("1. Start the Flask server: python3 app.py")
        print("2. Start the Angular app: ng serve")
        print("3. Login as admin.manager")
        print("4. Check the notification bell in the dashboard")
    else:
        print("\n❌ Tests failed!") 