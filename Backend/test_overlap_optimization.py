#!/usr/bin/env python3
"""
Test script for the optimized check_overlap operation in manage_resources.py
This script demonstrates how the new functionality can check for overlaps
among all schedules for a specific Room ID and Day.
"""

import json
import requests
from datetime import datetime

# Configuration
API_BASE_URL = "http://localhost:5000"  # Adjust if your Flask app runs on a different port
MANAGE_RESOURCES_ENDPOINT = f"{API_BASE_URL}/manage_resources"

def test_specific_time_overlap():
    """Test the original functionality: checking a specific time against existing schedules"""
    print("=== TESTING SPECIFIC TIME OVERLAP CHECK ===")
    
    test_data = {
        "operation": "check_overlap",
        "room_id": "SCB-SF1",
        "day": "Monday",
        "date": "2024-01-15",
        "start_time": "09:00",
        "end_time": "11:00",
        "page": 1,
        "per_page": 10
    }
    
    print(f"Testing specific time overlap for:")
    print(f"  Room: {test_data['room_id']}")
    print(f"  Day: {test_data['day']}")
    print(f"  Time: {test_data['start_time']}-{test_data['end_time']}")
    
    try:
        response = requests.post(MANAGE_RESOURCES_ENDPOINT, json=test_data)
        print(f"Response Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"Analysis Type: {result.get('analysis_type')}")
            print(f"Total Schedules: {result.get('total_schedules')}")
            print(f"Total Conflicts: {result.get('total_conflicts')}")
            print(f"Requested Time: {result.get('requested_time')}")
            
            if result.get('conflicts'):
                print("\nConflicts found:")
                for i, conflict in enumerate(result['conflicts'], 1):
                    print(f"  {i}. Course: {conflict.get('course')}")
                    print(f"     Time: {conflict.get('time')}")
                    print(f"     Department: {conflict.get('department')}")
            else:
                print("No conflicts found!")
                
        else:
            print(f"Error: {response.text}")
            
    except requests.exceptions.RequestException as e:
        print(f"Request failed: {e}")
    
    print("\n" + "="*60 + "\n")

def test_all_schedules_overlap():
    """Test the new functionality: checking all schedules against each other"""
    print("=== TESTING ALL SCHEDULES OVERLAP ANALYSIS ===")
    
    test_data = {
        "operation": "check_overlap",
        "room_id": "SCB-SF1",
        "day": "Monday",
        "date": "2024-01-15",
        # Note: No start_time and end_time - this triggers the new analysis mode
        "page": 1,
        "per_page": 20
    }
    
    print(f"Testing all schedules overlap analysis for:")
    print(f"  Room: {test_data['room_id']}")
    print(f"  Day: {test_data['day']}")
    print("  Mode: All schedules analysis (no specific time)")
    
    try:
        response = requests.post(MANAGE_RESOURCES_ENDPOINT, json=test_data)
        print(f"Response Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"Analysis Type: {result.get('analysis_type')}")
            print(f"Total Schedules: {result.get('total_schedules')}")
            print(f"Total Conflicts: {result.get('total_conflicts')}")
            
            if result.get('conflicts'):
                print("\nOverlapping schedule pairs found:")
                for i, conflict in enumerate(result['conflicts'], 1):
                    print(f"\n  {i}. OVERLAP DETECTED:")
                    
                    schedule1 = conflict.get('schedule_1', {})
                    schedule2 = conflict.get('schedule_2', {})
                    overlap_period = conflict.get('overlap_period', {})
                    
                    print(f"     Schedule 1: {schedule1.get('course')} ({schedule1.get('time')})")
                    print(f"                Department: {schedule1.get('department')}, Year: {schedule1.get('year')}")
                    print(f"     Schedule 2: {schedule2.get('course')} ({schedule2.get('time')})")
                    print(f"                Department: {schedule2.get('department')}, Year: {schedule2.get('year')}")
                    print(f"     Overlap Period: {overlap_period.get('start')}-{overlap_period.get('end')} ({overlap_period.get('duration_minutes')} minutes)")
            else:
                print("No overlapping schedules found! All schedules are properly scheduled.")
                
        else:
            print(f"Error: {response.text}")
            
    except requests.exceptions.RequestException as e:
        print(f"Request failed: {e}")
    
    print("\n" + "="*60 + "\n")

def test_multiple_rooms():
    """Test overlap analysis for multiple rooms"""
    print("=== TESTING MULTIPLE ROOMS ===")
    
    rooms_to_test = ["SCB-SF1", "SCB-SF2", "SCB-SF3", "SCB-SF4", "SCB-SF5"]
    day_to_test = "Monday"
    
    for room_id in rooms_to_test:
        print(f"\nAnalyzing overlaps for Room: {room_id}")
        
        test_data = {
            "operation": "check_overlap",
            "room_id": room_id,
            "day": day_to_test,
            "date": "2024-01-15",
            "page": 1,
            "per_page": 10
        }
        
        try:
            response = requests.post(MANAGE_RESOURCES_ENDPOINT, json=test_data)
            
            if response.status_code == 200:
                result = response.json()
                total_schedules = result.get('total_schedules', 0)
                total_conflicts = result.get('total_conflicts', 0)
                
                print(f"  Schedules: {total_schedules}, Conflicts: {total_conflicts}")
                
                if total_conflicts > 0:
                    print(f"  ⚠️  CONFLICTS DETECTED in {room_id}!")
                else:
                    print(f"  ✅ No conflicts in {room_id}")
                    
            else:
                print(f"  ❌ Error checking {room_id}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            print(f"  ❌ Request failed for {room_id}: {e}")
    
    print("\n" + "="*60 + "\n")

def display_api_usage():
    """Display how to use the optimized API"""
    print("=== API USAGE EXAMPLES ===")
    
    print("1. Check specific time against existing schedules:")
    print(json.dumps({
        "operation": "check_overlap",
        "room_id": "SCB-SF1",
        "day": "Monday",
        "date": "2024-01-15",
        "start_time": "09:00",
        "end_time": "11:00"
    }, indent=2))
    
    print("\n2. Analyze ALL schedules for overlaps (NEW FEATURE):")
    print(json.dumps({
        "operation": "check_overlap",
        "room_id": "SCB-SF1",
        "day": "Monday",
        "date": "2024-01-15"
        # Note: No start_time/end_time triggers comprehensive analysis
    }, indent=2))
    
    print("\n3. Response format for specific time check:")
    print(json.dumps({
        "status": "success",
        "analysis_type": "specific_time",
        "room_id": "SCB-SF1",
        "requested_time": "09:00-11:00",
        "total_conflicts": 1,
        "conflicts": [
            {
                "course": "MATH 101",
                "time": "10:00-12:00",
                "conflict_type": "time_overlap"
            }
        ]
    }, indent=2))
    
    print("\n4. Response format for all schedules analysis:")
    print(json.dumps({
        "status": "success",
        "analysis_type": "all_schedules",
        "room_id": "SCB-SF1",
        "total_schedules": 5,
        "total_conflicts": 1,
        "conflicts": [
            {
                "conflict_type": "schedule_overlap",
                "schedule_1": {
                    "course": "MATH 101",
                    "time": "09:00-11:00"
                },
                "schedule_2": {
                    "course": "PHYS 201",
                    "time": "10:00-12:00"
                },
                "overlap_period": {
                    "start": "10:00",
                    "end": "11:00",
                    "duration_minutes": 60
                }
            }
        ]
    }, indent=2))
    
    print("\n" + "="*60 + "\n")

if __name__ == "__main__":
    print("OPTIMIZED CHECK_OVERLAP OPERATION TEST SUITE")
    print("=" * 60)
    
    # Display usage examples
    display_api_usage()
    
    # Run tests
    test_specific_time_overlap()
    test_all_schedules_overlap()
    test_multiple_rooms()
    
    print("TEST SUITE COMPLETED")
    print("=" * 60) 