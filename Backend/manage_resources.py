from datetime import datetime, time
from flask import jsonify, request, Blueprint
import pandas as pd
from bson import ObjectId
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from dotenv import load_dotenv
import os
from process import preprocess_data
load_dotenv()


manage_resources_bp = Blueprint('manage_resources', __name__)
MONGO_URI = os.getenv("MONGO_URI")
try:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=8000)
    client.server_info()
    print("MongoDB connection successful in manage_resources")
    db = client['EduResourceDB']
    timetables = db['timetables']
except Exception as e:
    print(f"MongoDB connection error in manage_resources: {e}")
    try:
        client = MongoClient('mongodb://localhost:27017/', serverSelectionTimeoutMS=5000)
        client.server_info()
        print("Connected to local MongoDB in manage_resources")
        db = client['EduResourceDB']
        timetables = db['timetables']
    except Exception as local_e:
        print(f"Local MongoDB connection failed in manage_resources: {local_e}")
        print("WARNING: Resource management operations will not function correctly")
        db = None
        timetables = None
 
def validate_time_format(time_str):
   
    if not isinstance(time_str, str):
        return False
    
    # Check if time_str contains ':'
    if ':' not in time_str:
        return False
    
    parts = time_str.split(':')
    if len(parts) != 2:
        return False
    
    hours_str, minutes_str = parts
    
    # Check if both parts are digits
    if not (hours_str.isdigit() and minutes_str.isdigit()):
        return False
    
    try:
        hours, minutes = int(hours_str), int(minutes_str)
        # Validate range
        if not (0 <= hours <= 23 and 0 <= minutes <= 59):
            return False
        return True
    except ValueError:
        return False

def normalize_time_format(time_str):
   
    if not time_str or not isinstance(time_str, str):
        return time_str
    
    print(f"Normalizing time format: '{time_str}'")
    
   
    if '–' in time_str:  
        time_str = time_str.split('–')[0].strip()
        print(f"  → Split at en dash: '{time_str}'")
    elif '-' in time_str and ':' in time_str:  # hyphen used as separator
        time_str = time_str.split('-')[0].strip()
        print(f"  → Split at hyphen: '{time_str}'")
    elif '—' in time_str:  # em dash
        time_str = time_str.split('—')[0].strip()
        print(f"  → Split at em dash: '{time_str}'")
    
    # If time is already in HH:MM format, return it
    if validate_time_format(time_str):
        print(f"  → Already valid: '{time_str}'")
        return time_str
    
  
    try:
        if time_str.isdigit():
            result = f"{int(time_str):02d}:00"
            print(f"  → Converted digit to time: '{result}'")
            return result
        
       
        if ':' in time_str:
            hour, minute = time_str.split(':')
            result = f"{int(hour):02d}:{int(minute):02d}"
            print(f"  → Formatted with leading zeros: '{result}'")
            return result
    except (ValueError, TypeError) as e:
        print(f"  → Error parsing time: {e}")
    
 
    print(f"  → Could not normalize, returning as is: '{time_str}'")
    return time_str

def has_time_overlap(start1, end1, start2, end2):
    
    try:
        # Convert strings to datetime.time objects
        s1 = datetime.strptime(start1, '%H:%M').time()
        e1 = datetime.strptime(end1, '%H:%M').time()
        s2 = datetime.strptime(start2, '%H:%M').time()
        e2 = datetime.strptime(end2, '%H:%M').time()
        
        # If either period has zero duration, no overlap
        if s1 == e1 or s2 == e2:
            return False
            
       
        if e1 == s2 or e2 == s1:
            return False
            
        # Standard overlap check
        return s1 < e2 and e1 > s2
        
    except (ValueError, TypeError) as e:
        print(f"Error in has_time_overlap: {e}")
        
        return True

def serialize_mongo_doc(doc):
  
    if not doc:
        return doc
        
    serialized = {}
    for key, value in doc.items():
       
        if key == '_id' and isinstance(value, ObjectId):
            serialized[key] = str(value)
        
        elif isinstance(value, dict):
            serialized[key] = serialize_mongo_doc(value)
        
        elif isinstance(value, list) and all(isinstance(item, dict) for item in value):
            serialized[key] = [serialize_mongo_doc(item) for item in value]
       
        else:
            serialized[key] = value
            
    return serialized

def check_overlap(start1, end1, start2, end2):
   
    try:
        
        time_strings = [start1, end1, start2, end2]
        for time_str in time_strings:
            if not validate_time_format(time_str):
                print(f"Invalid time format detected: {time_str}")
                
                return True
        
       
        s1 = datetime.strptime(start1, '%H:%M').time()
        e1 = datetime.strptime(end1, '%H:%M').time()
        s2 = datetime.strptime(start2, '%H:%M').time()
        e2 = datetime.strptime(end2, '%H:%M').time()
        
        # Special case: if any period has zero duration
        if s1 == e1 or s2 == e2:
          
            return False
        

        return s1 <= e2 and e1 >= s2

    except (ValueError, TypeError) as e:
        print(f"Error in check_overlap: {e}")
       
        return True

def _check_schedule_conflict(schedule, requested_start, requested_end, day, room_id):
    """
    Check if a specific schedule conflicts with a requested time slot.
    Returns conflict info if there's an overlap, None otherwise.
    """
    try:
        # Get schedule details
        schedule_start = schedule.get('Start')
        schedule_end = schedule.get('End')
        schedule_day = schedule.get('Day', 'Unknown')
        schedule_date = schedule.get('Date', 'Unknown')
        schedule_course = schedule.get('Course', 'Unknown')
        schedule_department = schedule.get('Department', 'Unknown')
        schedule_year = schedule.get('Year', 'Unknown')
        schedule_lecturer = schedule.get('Lecturer', 'Unknown')
        
        # Handle combined time format (e.g., "08:00–10:00")
        if isinstance(schedule_start, str) and '–' in schedule_start:
            time_parts = schedule_start.split('–')
            if len(time_parts) == 2:
                schedule_start = time_parts[0].strip()
                if not schedule_end or not isinstance(schedule_end, str):
                    schedule_end = time_parts[1].strip()
        
        # Normalize time formats
        schedule_start = normalize_time_format(schedule_start)
        schedule_end = normalize_time_format(schedule_end)
        
        print(f"Checking schedule: Room={room_id}, Day={schedule_day}, Date={schedule_date}, " +
              f"Time={schedule_start}-{schedule_end}, Course={schedule_course}")
        
        # Validate time formats
        if not validate_time_format(schedule_start) or not validate_time_format(schedule_end):
            print(f"  → Skipping due to invalid time format")
            return None
        
        # Check day match
        if schedule_day != day and schedule_day != "Unknown":
            print(f"  → Skipping due to day mismatch: schedule day '{schedule_day}' != requested day '{day}'")
            return None
        
        # Check for time overlap
        overlap = check_overlap(requested_start, requested_end, schedule_start, schedule_end)
        print(f"  → Overlap result: {overlap}")
        
        if overlap:
            conflict_info = {
                'schedule_id': str(schedule.get('_id', 'Unknown')),
                'room_id': schedule.get('Room ID', room_id),
                'course': schedule_course,
                'time': f"{schedule_start}-{schedule_end}",
                'day': schedule_day,
                'date': schedule_date,
                'department': schedule_department,
                'year': schedule_year,
                'lecturer': schedule_lecturer,
                'conflict_type': 'time_overlap'
            }
            print(f"  → CONFLICT DETECTED: {conflict_info}")
            return conflict_info
        else:
            print(f"  → No conflict")
            return None
            
    except Exception as e:
        print(f"Error checking schedule conflict: {e}")
        return None

def _analyze_all_schedule_overlaps(schedules, day, room_id):
    """
    Analyze all schedules for a room/day to find overlaps between existing schedules.
    Returns a list of all conflicts found.
    """
    conflicts = []
    valid_schedules = []
    
    # First, prepare and validate all schedules
    for i, schedule in enumerate(schedules):
        try:
            # Get schedule details
            schedule_start = schedule.get('Start')
            schedule_end = schedule.get('End')
            schedule_day = schedule.get('Day', 'Unknown')
            schedule_course = schedule.get('Course', 'Unknown')
            schedule_department = schedule.get('Department', 'Unknown')
            schedule_year = schedule.get('Year', 'Unknown')
            schedule_lecturer = schedule.get('Lecturer', 'Unknown')
            
            # Handle combined time format
            if isinstance(schedule_start, str) and '–' in schedule_start:
                time_parts = schedule_start.split('–')
                if len(time_parts) == 2:
                    schedule_start = time_parts[0].strip()
                    if not schedule_end or not isinstance(schedule_end, str):
                        schedule_end = time_parts[1].strip()
            
            # Normalize time formats
            schedule_start = normalize_time_format(schedule_start)
            schedule_end = normalize_time_format(schedule_end)
            
            # Validate time formats and day
            if (validate_time_format(schedule_start) and 
                validate_time_format(schedule_end) and 
                (schedule_day == day or schedule_day == "Unknown")):
                
                valid_schedules.append({
                    'index': i,
                    'schedule': schedule,
                    'start': schedule_start,
                    'end': schedule_end,
                    'course': schedule_course,
                    'department': schedule_department,
                    'year': schedule_year,
                    'lecturer': schedule_lecturer,
                    'day': schedule_day
                })
            else:
                print(f"Skipping invalid schedule {i}: Start={schedule_start}, End={schedule_end}, Day={schedule_day}")
                
        except Exception as e:
            print(f"Error processing schedule {i}: {e}")
            continue
    
    print(f"Processing {len(valid_schedules)} valid schedules for overlap analysis")
    
    # Check each schedule against all others
    for i in range(len(valid_schedules)):
        for j in range(i + 1, len(valid_schedules)):
            schedule_a = valid_schedules[i]
            schedule_b = valid_schedules[j]
            
            # Check for overlap between the two schedules
            if check_overlap(schedule_a['start'], schedule_a['end'], 
                           schedule_b['start'], schedule_b['end']):
                
                conflict_info = {
                    'conflict_type': 'schedule_overlap',
                    'room_id': room_id,
                    'day': day,
                    'schedule_1': {
                        'id': str(schedule_a['schedule'].get('_id', f'schedule_{schedule_a["index"]}')),
                        'course': schedule_a['course'],
                        'time': f"{schedule_a['start']}-{schedule_a['end']}",
                        'department': schedule_a['department'],
                        'year': schedule_a['year'],
                        'lecturer': schedule_a['lecturer']
                    },
                    'schedule_2': {
                        'id': str(schedule_b['schedule'].get('_id', f'schedule_{schedule_b["index"]}')),
                        'course': schedule_b['course'],
                        'time': f"{schedule_b['start']}-{schedule_b['end']}",
                        'department': schedule_b['department'],
                        'year': schedule_b['year'],
                        'lecturer': schedule_b['lecturer']
                    },
                    'overlap_period': _calculate_overlap_period(
                        schedule_a['start'], schedule_a['end'],
                        schedule_b['start'], schedule_b['end']
                    )
                }
                
                conflicts.append(conflict_info)
                print(f"OVERLAP DETECTED: {schedule_a['course']} ({schedule_a['start']}-{schedule_a['end']}) " +
                      f"overlaps with {schedule_b['course']} ({schedule_b['start']}-{schedule_b['end']})")
    
    print(f"Found {len(conflicts)} overlapping schedule pairs")
    return conflicts

def _calculate_overlap_period(start1, end1, start2, end2):
  
    try:
        from datetime import datetime
        
        s1 = datetime.strptime(start1, '%H:%M').time()
        e1 = datetime.strptime(end1, '%H:%M').time()
        s2 = datetime.strptime(start2, '%H:%M').time()
        e2 = datetime.strptime(end2, '%H:%M').time()
        
        # Calculate overlap start and end
        overlap_start = max(s1, s2)
        overlap_end = min(e1, e2)
        
        return {
            'start': overlap_start.strftime('%H:%M'),
            'end': overlap_end.strftime('%H:%M'),
            'duration_minutes': int((datetime.combine(datetime.today(), overlap_end) - 
                                   datetime.combine(datetime.today(), overlap_start)).total_seconds() / 60)
        }
    except Exception as e:
        print(f"Error calculating overlap period: {e}")
        return {
            'start': 'Unknown',
            'end': 'Unknown',
            'duration_minutes': 0
        }

def _calculate_free_slots_improved(occupied_slots, business_start, business_end):

    free_slots = []
    
    if not occupied_slots:
        # Entire day is free
        duration_mins = time_diff_minutes(business_start, business_end)
        if duration_mins > 0:
            free_slots.append({
                'start': business_start,
                'end': business_end,
                'duration': format_duration(duration_mins)
            })
        return free_slots
    
    # Sort occupied slots by start time using proper time comparison
    occupied_slots.sort(key=lambda x: datetime.strptime(x['start'], '%H:%M').time())
    
    # Merge overlapping slots to handle data quality issues
    merged_slots = []
    for slot in occupied_slots:
        if not merged_slots:
            merged_slots.append(slot)
        else:
            last_slot = merged_slots[-1]

            if (is_time_before(slot['start'], last_slot['end']) or 
                slot['start'] == last_slot['end']):
                # Merge slots - extend the end time if necessary
                if is_time_after(slot['end'], last_slot['end']):
                    last_slot['end'] = slot['end']
                # Update course info to show multiple courses
                if last_slot['course'] != slot['course']:
                    last_slot['course'] = f"{last_slot['course']}, {slot['course']}"
            else:
                merged_slots.append(slot)
    
    # Find free slots between merged occupied slots
    current_time = business_start
    
    for slot in merged_slots:
        # Check if there's free time before this slot
        if is_time_before(current_time, slot['start']):
            duration_mins = time_diff_minutes(current_time, slot['start'])
            if duration_mins > 0:  # Only add slots with positive duration
                free_slots.append({
                    'start': current_time,
                    'end': slot['start'],
                    'duration': format_duration(duration_mins)
                })
        
        # Move current time to after this slot
        if is_time_after(slot['end'], current_time):
            current_time = slot['end']
    
    # Check if there's free time after the last slot
    if is_time_before(current_time, business_end):
        duration_mins = time_diff_minutes(current_time, business_end)
        if duration_mins > 0:
            free_slots.append({
                'start': current_time,
                'end': business_end,
                'duration': format_duration(duration_mins)
            })
    
    return free_slots

@manage_resources_bp.route('/manage_resources', methods=['POST', 'GET'])
def manage_resources():
   
    try:
        
        if db is None or timetables is None:
            return jsonify({
                'status': 'error', 
                'error': 'Database connection is not available. Please check your MongoDB connection.'
            }), 503  
            
        data = request.get_json()
        if not data or 'operation' not in data:
            return jsonify({'error': 'Missing operation in request'}), 400

        operation = data.get('operation')
        room_id = data.get('room_id')
        date = data.get('date', datetime.now().strftime('%Y-%m-%d'))
        start_time = data.get('start_time')
        end_time = data.get('end_time')
        day = data.get('day', datetime.now().strftime('%A'))
        schedule_id = data.get('schedule_id')
        new_schedule = data.get('new_schedule', {})
        department = data.get('department')

        
        
        day_provided_in_request = 'day' in data and data['day']
        
        
        if date:
            try:
                date_obj = datetime.strptime(date, '%Y-%m-%d')
                inferred_day = date_obj.strftime('%A')
                
               
                if not day_provided_in_request:
                    day = inferred_day
                    print(f"Day not provided in request, using inferred day: {day}")
                else:
                    print(f"Using day provided in request: {day} (inferred from date: {inferred_day})")
            except ValueError:
                return jsonify({'error': 'Invalid date format, use YYYY-MM-DD'}), 400
        
        
        valid_days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        if day not in valid_days:
            return jsonify({'error': f'Invalid day format. Must be one of: {", ".join(valid_days)}'}), 400
            
        print(f"Final day used for scheduling: {day}")

        
       
        
        if operation == 'check_overlap':
            # Modified to handle both specific time checking and general overlap analysis
            if not room_id:
                return jsonify({'status': 'error', 'error': 'Missing required field: room_id'}), 400

            # Check if this is a specific time check or general overlap analysis
            is_specific_time_check = start_time and end_time
            
            if is_specific_time_check:
                # Validate time formats for specific time checking
                if not validate_time_format(start_time) or not validate_time_format(end_time):
                    return jsonify({'status': 'error', 'error': 'Invalid time format for start_time or end_time. Use HH:MM format.'}), 400
                
            else:
                print(f"Analyzing ALL schedule overlaps on {day} for room {room_id}")

            # Query for existing schedules
            query_day = {'Room ID': room_id, 'Day': day}
            existing_schedules_by_day = list(timetables.find(query_day, {'_id': 0}))
            
            # Fallback to date-based query if no day-based schedules found
            if not existing_schedules_by_day:
                query_date = {'Room ID': room_id, 'Date': date}
                existing_schedules_by_date = list(timetables.find(query_date, {'_id': 0}))
                existing_schedules = existing_schedules_by_date
            else:
                existing_schedules = existing_schedules_by_day
            
            print(f"Found {len(existing_schedules)} schedules for room {room_id} on {day} ({date})")

            conflicts = []
            
            if is_specific_time_check:
                # Original logic: Check specific time against all schedules
                for schedule in existing_schedules:
                    conflict_info = _check_schedule_conflict(schedule, start_time, end_time, day, room_id)
                    if conflict_info:
                        conflicts.append(conflict_info)
            else:
                # New logic: Check all schedules against each other for overlaps
                conflicts = _analyze_all_schedule_overlaps(existing_schedules, day, room_id)

            # Pagination parameters
            page = int(data.get('page', 1))
            per_page = int(data.get('per_page', 20))  # Increased default for overlap analysis
            
            # Ensure valid pagination parameters
            if page < 1:
                page = 1
            if per_page < 1 or per_page > 100:  # Increased max for overlap analysis
                per_page = 20
            
            # Apply pagination to conflicts
            total_count = len(conflicts)
            start_idx = (page - 1) * per_page
            end_idx = start_idx + per_page
            paginated_conflicts = conflicts[start_idx:end_idx]
            
            # Calculate pagination metadata
            total_pages = (total_count + per_page - 1) // per_page if total_count > 0 else 1
            has_next = page < total_pages
            has_prev = page > 1

            response_data = {
                'status': 'success',
                'operation': 'check_overlap',
                'room_id': room_id,
                'day': day,
                'date': date,
                'analysis_type': 'specific_time' if is_specific_time_check else 'all_schedules',
                'total_schedules': len(existing_schedules),
                'total_conflicts': total_count,
                'conflicts': paginated_conflicts,
                'pagination': {
                    'page': page,
                    'per_page': per_page,
                    'total_items': total_count,
                    'total_pages': total_pages,
                    'has_next': has_next,
                    'has_prev': has_prev
                }
            }
            
            if is_specific_time_check:
                response_data['requested_time'] = f"{start_time}-{end_time}"
            
            return jsonify(response_data), 200

        elif operation == 'reallocate':
            if not schedule_id or not new_schedule:
                return jsonify({'status': 'error', 'error': 'Missing schedule_id or new_schedule'}), 400

            # Get additional parameters to uniquely identify the specific schedule
            original_day = data.get('original_day')
            original_start_time = data.get('original_start_time')
            original_end_time = data.get('original_end_time')
            original_course = data.get('original_course')
            
            # Build query to find the specific schedule entry
            query = {'Room ID': schedule_id}
            
            # Add additional filters if provided to uniquely identify the schedule
            if original_day:
                query['Day'] = original_day
            if original_start_time:
                query['Start'] = original_start_time
            if original_end_time:
                query['End'] = original_end_time
            if original_course:
                query['Course'] = original_course
            
            # Find the specific schedule
            original_schedule = timetables.find_one(query)
            if not original_schedule:
                return jsonify({'status': 'error', 'error': 'Specific schedule not found. Please provide more details to identify the exact schedule.'}), 404
            
            # If multiple schedules match, return error asking for more specific identification
            if original_day and original_start_time and original_end_time:
                # This should be unique enough, but let's double-check
                matching_schedules = list(timetables.find(query))
                if len(matching_schedules) > 1:
                    return jsonify({
                        'status': 'error', 
                        'error': 'Multiple schedules found with the same criteria. Please provide course name or other unique identifier.',
                        'matching_schedules': [
                            {
                                'room_id': schedule.get('Room ID'),
                                'course': schedule.get('Course'),
                                'day': schedule.get('Day'),
                                'time': f"{schedule.get('Start')}-{schedule.get('End')}",
                                'lecturer': schedule.get('Lecturer')
                            } for schedule in matching_schedules
                        ]
                    }), 400
            
            original_date = original_schedule.get('Date')

            # Handle partial updates - use original values for missing fields
            new_room_id = new_schedule.get('room_id', original_schedule.get('Room ID'))
            new_date = new_schedule.get('date', original_date)
            new_start_time = new_schedule.get('start_time', original_schedule.get('Start'))
            new_end_time = new_schedule.get('end_time', original_schedule.get('End'))
            new_day = new_schedule.get('day', original_schedule.get('Day'))
            
            # Get course information fields with fallbacks to original values
            new_course = new_schedule.get('course', original_schedule.get('Course', 'Unknown'))
            new_department = new_schedule.get('department', original_schedule.get('Department', 'Unknown'))
            new_year = new_schedule.get('year', original_schedule.get('Year', 'Unknown'))
            new_status = new_schedule.get('status', original_schedule.get('Status', 'Booked'))
            new_lecturer = new_schedule.get('lecturer', original_schedule.get('Instructor', 'Unknown'))  # Fixed: use 
            if not validate_time_format(new_start_time) or not validate_time_format(new_end_time):
                return jsonify({'status': 'error', 'error': 'Invalid time format in new_schedule. Use HH:MM format.'}), 400

            room_changed = new_room_id != original_schedule.get('Room ID')
            time_changed = (new_start_time != original_schedule.get('Start') or 
                          new_end_time != original_schedule.get('End') or
                          new_day != original_schedule.get('Day'))
            
            conflicts = []
            if room_changed or time_changed:
               
                new_room_query = {'Room ID': new_room_id, 'Day': new_day}
                existing_schedules = list(timetables.find(new_room_query, {'_id': 0}))

                for schedule in existing_schedules:
                   
                    if (schedule.get('Room ID') == original_schedule.get('Room ID') and
                        schedule.get('Start') == original_schedule.get('Start') and
                        schedule.get('End') == original_schedule.get('End') and
                        schedule.get('Course') == original_schedule.get('Course')):
                        continue
                        
                    schedule_start = schedule.get('Start')
                    schedule_end = schedule.get('End')
                    
                   
                    if not validate_time_format(schedule_start) or not validate_time_format(schedule_end):
                        print(f"Skipping schedule with invalid time format: Start={schedule_start}, End={schedule_end}")
                        continue
                    
                    if check_overlap(new_start_time, new_end_time, schedule_start, schedule_end):
                        conflicts.append({
                            'schedule_id': schedule.get('Room ID', 'Unknown'),
                            'course': schedule.get('Course', 'Unknown'),
                            'time': f"{schedule_start}-{schedule_end}",
                            'day': schedule.get('Day', 'Unknown'),
                            'lecturer': schedule.get('Lecturer', 'Unknown')
                        })

            
            page = int(data.get('page', 1))
            per_page = int(data.get('per_page', 10))  
            
           
            if page < 1:
                page = 1
            if per_page < 1 or per_page > 50:  
                per_page = 10
            
            # Apply pagination to conflicts
            total_count = len(conflicts)
            start_idx = (page - 1) * per_page
            end_idx = start_idx + per_page
            paginated_conflicts = conflicts[start_idx:end_idx]
            
            
            total_pages = (total_count + per_page - 1) // per_page if total_count > 0 else 1  
            has_next = page < total_pages
            has_prev = page > 1

            if conflicts:
                return jsonify({
                    'status': 'error',
                    'error': 'Reallocation failed due to conflicts',
                    'conflicts': paginated_conflicts,
                    'pagination': {
                        'page': page,
                        'per_page': per_page,
                        'total_items': total_count,
                        'total_pages': total_pages,
                        'has_next': has_next,
                        'has_prev': has_prev
                    }
                }), 400

            
            update = {
                '$set': {
                    'Room ID': new_room_id,
                    'Date': new_date,
                    'Start': new_start_time,
                    'End': new_end_time,
                    'Day': new_day,
                    'Course': new_course,
                    'Department': new_department,
                    'Year': new_year,
                    'Status': new_status,
                    'Lecturer': new_lecturer
                }
            }
            result = timetables.update_one(query, update)  
            if result.matched_count == 0:
                return jsonify({'status': 'error', 'error': 'Schedule not found'}), 404

            return jsonify({
                'status': 'success',
                'message': 'Schedule reallocated successfully',
                'original_schedule': {
                    'room_id': original_schedule.get('Room ID'),
                    'course': original_schedule.get('Course'),
                    'day': original_schedule.get('Day'),
                    'time': f"{original_schedule.get('Start')}-{original_schedule.get('End')}"
                },
                'new_schedule': {
                    'room_id': new_room_id,
                    'date': new_date,
                    'start_time': new_start_time,
                    'end_time': new_end_time,
                    'day': new_day,
                    'course': new_course,
                    'department': new_department,
                    'year': new_year,
                    'status': new_status,
                    'lecturer': new_lecturer
                }
            }), 200

        # Operation: Inject new schedule
        elif operation == 'inject_schedule':
            try:
                # Updated validation to make date optional and day required
                if not all([room_id, start_time, end_time, day]):
                    return jsonify({'status': 'error', 'error': 'Missing required fields: room_id, start_time, end_time, day'}), 400

                # Validate time formats
                if not validate_time_format(start_time) or not validate_time_format(end_time):
                    return jsonify({'status': 'error', 'error': 'Invalid time format for start_time or end_time. Use HH:MM format.'}), 400

                print(f"Checking for conflicts on {day} for room {room_id} from {start_time} to {end_time}")

                # Query by day of week - using the provided day
                query = {'Room ID': room_id, 'Day': day}
                existing_schedules = list(timetables.find(query, {'_id': 0}))
                print(f"Found {len(existing_schedules)} schedules for room {room_id} on {day}")

                conflicts = []
                for schedule in existing_schedules:
                    # Get schedule details
                    schedule_start = schedule.get('Start')
                    schedule_end = schedule.get('End')
                    schedule_course = schedule.get('Course', 'Unknown')

                    # Handle different time formats - normalize to HH:MM if needed
                    if isinstance(schedule_start, str) and '–' in schedule_start:
                        time_parts = schedule_start.split('–')
                        if len(time_parts) == 2:
                            schedule_start = time_parts[0].strip()
                            if not schedule_end or not isinstance(schedule_end, str):
                                schedule_end = time_parts[1].strip()

                    # Normalize times
                    schedule_start = normalize_time_format(schedule_start)
                    schedule_end = normalize_time_format(schedule_end)

                    print(f"Checking potential conflict: Course={schedule_course}, Time={schedule_start}-{schedule_end}")

                    if not validate_time_format(schedule_start) or not validate_time_format(schedule_end):
                        print(f"  → Skipping due to invalid time format")
                        continue

                    has_overlap = has_time_overlap(start_time, end_time, schedule_start, schedule_end)
                    print(f"  → Overlap check result: {has_overlap}")

                    if has_overlap:
                        conflict = {
                            'schedule_id': schedule.get('Room ID', 'Unknown'),
                            'course': schedule_course,
                            'time': f"{schedule_start}-{schedule_end}"
                        }
                        conflicts.append(conflict)
                        print(f"  → CONFLICT DETECTED: {conflict}")

                if conflicts:
                    return jsonify({
                        'status': 'error',
                        'error': 'Schedule injection failed due to conflicts',
                        'conflicts': conflicts
                    }), 400

                # Create new schedule document with fixed field mappings
                new_schedule_doc = {
                    'Room ID': room_id,
                    'Date': date if date else datetime.now().strftime('%Y-%m-%d'),  
                    'Start': start_time,
                    'End': end_time,
                    'Day': day,
                    'Course': data.get('course', 'Unknown'),
                    'Department': data.get('department', 'Unknown'),
                    'Lecturer': data.get('instructor', 'Unknown'),  # Fixed: frontend sends 'instructor'
                    'Year': data.get('year', 'Unknown'),  # Fixed: frontend sends 'year'
                    'Status': data.get('status', 'Booked')
                }

                result = timetables.insert_one(new_schedule_doc)

                response_doc = serialize_mongo_doc(new_schedule_doc)

                try:
                    all_room_schedules = list(timetables.find({'Room ID': room_id}, {'_id': 0}))

                    if all_room_schedules:
                        # Convert to DataFrame
                        df = pd.DataFrame(all_room_schedules)
                        _, daily_summary, weekly_summary = preprocess_data(df)

                        # Filter for just this room
                        daily_summary_df = daily_summary[daily_summary['Room ID'] == room_id]
                        weekly_summary_df = weekly_summary[weekly_summary['Room ID'] == room_id]

                        return jsonify({
                            'status': 'success',
                            'message': 'Schedule injected successfully',
                            'schedule_id': room_id,
                            'schedule': response_doc,
                            'refreshed_data': {
                                'daily_utilization': daily_summary_df.to_dict(orient='records'),
                                'weekly_summary': weekly_summary_df.to_dict(orient='records')
                            }
                        }), 201
                except Exception as e:
                    print(f"Warning: Failed to refresh aggregated data: {str(e)}")

                return jsonify({
                    'status': 'success',
                    'message': 'Schedule injected successfully',
                    'schedule_id': room_id,
                    'schedule': response_doc
                }), 201

            except Exception as e:
                print(f"Error in inject_schedule: {str(e)}")
                return jsonify({'status': 'error', 'error': f'Unexpected error: {str(e)}'}), 500

        # Operation: Get schedules for a room on a specific day
        elif operation == 'get_room_schedules':
            try:
                if not room_id:
                    return jsonify({'error': 'Missing required field: room_id', 'status': 'error'}), 400
                
                # Pagination parameters
                page = int(data.get('page', 1))
                per_page = int(data.get('per_page', 10))  
                
                if page < 1:
                    page = 1
                if per_page < 1 or per_page > 50:  
                    per_page = 10
                
                # Calculate skip value for pagination
                skip = (page - 1) * per_page
                
                
                query = {'Room ID': room_id}
                if day:
                    query['Day'] = day
                
                # Get total count for pagination info
                total_count = timetables.count_documents(query)
                
               
                schedules = list(timetables.find(query, {'_id': 0}).skip(skip).limit(per_page))
                
                # Format times consistently for display
                for schedule in schedules:
                    start = schedule.get('Start', '')
                    end = schedule.get('End', '')
                    if start and end:
                        schedule['Time'] = f"{start}–{end}"  
                
                # Serialize for JSON response
                serialized_schedules = [serialize_mongo_doc(s) for s in schedules]
                
                
                total_pages = (total_count + per_page - 1) // per_page  
                has_next = page < total_pages
                has_prev = page > 1
                
                return jsonify({
                    'status': 'success',
                    'message': f'Found {total_count} schedules',
                    'room_id': room_id,
                    'day': day if day else 'All days',
                    'schedules': serialized_schedules,
                    'pagination': {
                        'page': page,
                        'per_page': per_page,
                        'total_items': total_count,
                        'total_pages': total_pages,
                        'has_next': has_next,
                        'has_prev': has_prev
                    }
                }), 200
                
            except Exception as e:
                print(f"Error in get_room_schedules: {str(e)}")
                return jsonify({'error': f'Unexpected error: {str(e)}', 'status': 'error'}), 500
                
        # Operation: Suggest rooms - IMPROVED VERSION
        elif operation == 'suggest_rooms':
            try:
                # Validate required fields
                if not day or not start_time or not end_time:
                    return jsonify({'status': 'error', 'error': 'Missing required fields: day, start_time, end_time'}), 400

                # Validate time formats
                if not validate_time_format(start_time):
                    return jsonify({'status': 'error', 'error': 'Invalid time format for start_time. Use HH:MM format.'}), 400
                if not validate_time_format(end_time):
                    return jsonify({'status': 'error', 'error': 'Invalid time format for end_time. Use HH:MM format.'}), 400

                # Validate that end_time is after start_time
                if not is_time_before(start_time, end_time):
                    return jsonify({'status': 'error', 'error': 'End time must be after start time.'}), 400

                # Get business hours for the day
                business_start, business_end = get_business_hours(day)
                
                # Validate requested time is within business hours
                if is_time_before(start_time, business_start) or is_time_after(end_time, business_end):
                    return jsonify({
                        'status': 'warning', 
                        'message': f'Requested time is outside business hours ({business_start}-{business_end})',
                        'business_hours': {'start': business_start, 'end': business_end}
                    }), 200

                # OPTIMIZATION: Single bulk query instead of N+1 queries
                if room_id:
                    room_filter = {'Room ID': room_id, 'Day': day}
                    all_rooms = [room_id]
                else:
                    room_filter = {'Day': day}
                    all_rooms = list(timetables.distinct('Room ID'))
                
                # Get all schedules for the day in one query
                all_schedules = list(timetables.find(room_filter, {'_id': 0}))
                
                # Group schedules by room
                schedules_by_room = {}
                for schedule in all_schedules:
                    room = schedule.get('Room ID')
                    if room not in schedules_by_room:
                        schedules_by_room[room] = []
                    schedules_by_room[room].append(schedule)
                
                # Find available rooms with their free time slots
                available_rooms = []
                
                for room in all_rooms:
                    schedules = schedules_by_room.get(room, [])
                    
                    # Normalize and validate schedule times
                    normalized_schedules = []
                    for schedule in schedules:
                        schedule_start = schedule.get('Start')
                        schedule_end = schedule.get('End')
                        
                        # Handle combined time format (e.g., "08:00–10:00")
                        if isinstance(schedule_start, str) and '–' in schedule_start:
                            time_parts = schedule_start.split('–')
                            if len(time_parts) == 2:
                                schedule_start = time_parts[0].strip()
                                if not schedule_end or not isinstance(schedule_end, str):
                                    schedule_end = time_parts[1].strip()
                        
                        # Normalize time formats
                        schedule_start = normalize_time_format(schedule_start)
                        schedule_end = normalize_time_format(schedule_end)
                        
                        # Only include valid schedules
                        if validate_time_format(schedule_start) and validate_time_format(schedule_end):
                            # Check for overlapping/invalid schedules
                            duration = time_diff_minutes(schedule_start, schedule_end)
                            if duration > 0:  # Valid duration
                                normalized_schedules.append({
                                    'start': schedule_start,
                                    'end': schedule_end,
                                    'course': schedule.get('Course', 'Unknown'),
                                    'department': schedule.get('Department', 'Unknown')
                                })
                            else:
                                print(f"Warning: Invalid schedule duration for {room}: {schedule_start}-{schedule_end}")
                    
                    # Calculate free time slots using improved logic
                    free_slots = _calculate_free_slots_improved(normalized_schedules, business_start, business_end)
                    
                    # Check if the room is available during the requested time
                    is_available = True
                    conflicting_schedule = None
                    
                    for schedule in normalized_schedules:
                        if check_overlap(start_time, end_time, schedule['start'], schedule['end']):
                            is_available = False
                            conflicting_schedule = schedule
                            break
                    
                    # Prepare room information
                    room_info = {
                        'room_id': room,
                        'status': 'Available' if is_available else 'Conflicted',
                        'free_slots': free_slots,  # Use the improved free_slots
                        'requested_slot': {
                            'start': start_time,
                            'end': end_time,
                            'duration': format_duration(time_diff_minutes(start_time, end_time))
                        },
                        'total_schedules': len(normalized_schedules),
                        'business_hours': {'start': business_start, 'end': business_end}
                    }
                    
                    if not is_available:
                        room_info['conflict'] = {
                            'course': conflicting_schedule['course'],
                            'time': f"{conflicting_schedule['start']}-{conflicting_schedule['end']}",
                            'department': conflicting_schedule['department']
                        }
                    
                    # Always include room info, but mark availability
                    if is_available:
                        available_rooms.append(room_info)
                    else:
                        # Still include conflicted rooms for user information
                        available_rooms.append(room_info)

                # Sort rooms by availability and then by total free time
                def sort_key(room):
                    total_free_minutes = sum(time_diff_minutes(slot['start'], slot['end']) for slot in room['free_slots'])
                    is_available = 1 if room['status'] == 'Available' else 0
                    return (is_available, total_free_minutes)
                
                available_rooms.sort(key=sort_key, reverse=True)
                
                # Separate available and conflicted rooms
                truly_available = [r for r in available_rooms if r['status'] == 'Available']
                conflicted_rooms = [r for r in available_rooms if r['status'] == 'Conflicted']

                return jsonify({
                    'status': 'success',
                    'message': f'Found {len(truly_available)} available rooms, {len(conflicted_rooms)} conflicted',
                    'date': date,
                    'day': day,
                    'time': f"{start_time}-{end_time}",
                    'business_hours': {'start': business_start, 'end': business_end},
                    'suggested_rooms': truly_available,
                    'conflicted_rooms': conflicted_rooms,
                    'total_available': len(truly_available),
                    'total_conflicted': len(conflicted_rooms),
                    'analysis': {
                        'requested_duration': format_duration(time_diff_minutes(start_time, end_time)),
                        'total_rooms_analyzed': len(all_rooms),
                        'rooms_with_schedules': len([r for r in all_rooms if r in schedules_by_room])
                    }
                }), 200
                
            except Exception as e:
                print(f"Error in suggest_rooms: {str(e)}")
                return jsonify({'status': 'error', 'error': f'Unexpected error: {str(e)}'}), 500

        else:
            return jsonify({'status': 'error', 'error': f'Invalid operation: {operation}'}), 400

    except KeyError as e:
        return jsonify({'status': 'error', 'error': f'Key error: {str(e)}'}), 400
    except PyMongoError as e:
        return jsonify({'status': 'error', 'error': f'Database error: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'status': 'error', 'error': f'Unexpected error: {str(e)}'}), 500

# Helper function to calculate time difference in minutes - FIXED VERSION
def time_diff_minutes(start_time, end_time):
    """
    Calculate time difference in minutes between two time strings.
    Handles overnight periods and validates input.
    
    Args:
        start_time (str): Start time in HH:MM format
        end_time (str): End time in HH:MM format
    
    Returns:
        int: Time difference in minutes (0 if invalid)
    """
    try:
        # Validate input formats first
        if not validate_time_format(start_time) or not validate_time_format(end_time):
            print(f"Invalid time format: start={start_time}, end={end_time}")
            return 0
        
        # Parse times
        start_dt = datetime.strptime(start_time, '%H:%M')
        end_dt = datetime.strptime(end_time, '%H:%M')
        
        # Calculate difference
        diff = (end_dt - start_dt).total_seconds() / 60
        
        # Handle overnight periods (end time is next day)
        if diff < 0:
            # Add 24 hours (1440 minutes) for overnight periods
            diff += 24 * 60
            print(f"Detected overnight period: {start_time} to {end_time} = {diff} minutes")
        
        # Validate reasonable duration (max 24 hours)
        if diff > 24 * 60:
            print(f"Warning: Duration exceeds 24 hours: {start_time} to {end_time}")
            return 0
        
        return int(diff)
        
    except ValueError as e:
        print(f"Error parsing times: {start_time}, {end_time} - {e}")
        return 0
    except Exception as e:
        print(f"Unexpected error in time_diff_minutes: {e}")
        return 0

# Helper function to format duration - IMPROVED VERSION
def format_duration(minutes):
    """
    Format duration in minutes to human-readable string.
    
    Args:
        minutes (int): Duration in minutes
    
    Returns:
        str: Formatted duration string
    """
    if minutes <= 0:
        return "0m"
    
    hours = int(minutes // 60)
    mins = int(minutes % 60)
    
    if hours > 0 and mins > 0:
        return f"{hours}h {mins}m"
    elif hours > 0:
        return f"{hours}h"
    elif mins > 0:
        return f"{mins}m"
    else:
        return "0m"

def compare_times(time1, time2):
    
    try:
        if not validate_time_format(time1) or not validate_time_format(time2):
            return 0
        
        t1 = datetime.strptime(time1, '%H:%M').time()
        t2 = datetime.strptime(time2, '%H:%M').time()
        
        if t1 < t2:
            return -1
        elif t1 > t2:
            return 1
        else:
            return 0
    except Exception as e:
        print(f"Error comparing times {time1} and {time2}: {e}")
        return 0

def is_time_before(time1, time2):

    return compare_times(time1, time2) == -1

def is_time_after(time1, time2):
    """Check if time1 is after time2"""
    return compare_times(time1, time2) == 1

def get_business_hours(day=None):
    """
    Get business hours for a given day.
    This can be made configurable in the future.
    
    Args:
        day (str): Day of week (optional)
    
    Returns:
        tuple: (start_time, end_time) in HH:MM format
    """
    # Default business hours - can be made configurable
    default_hours = {
        'monday': ('08:00', '20:00'),
        'tuesday': ('08:00', '20:00'),
        'wednesday': ('08:00', '20:00'),
        'thursday': ('08:00', '20:00'),
        'friday': ('08:00', '20:00')
    }
    
    if day and day.lower() in default_hours:
        return default_hours[day.lower()]
    
    # Default fallback
    return ('08:00', '20:00')

