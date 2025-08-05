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
        return None
    
    # Remove extra whitespace
    time_str = str(time_str).strip()
    
    # If it's already empty or None-like, return None
    if not time_str or time_str.lower() in ['none', 'null', 'nan', '']:
        return None
    
    try:
        # Handle combined time format (e.g., "08:00–10:00")
        if '–' in time_str or '-' in time_str:
            # Extract just the start time
            parts = time_str.replace('–', '-').split('-')
            if len(parts) >= 2:
                # Take the first part as the start time
                time_str = parts[0].strip()
        
        # Remove common time suffixes
        time_str = time_str.replace('hrs', '').replace('hr', '').replace('h', '').strip()
        
        # Handle formats without colons
        if ':' not in time_str:
            if time_str.isdigit():
                if len(time_str) == 1:  # "8" -> "08:00"
                    time_str = f"0{time_str}:00"
                elif len(time_str) == 2:  # "14" -> "14:00"
                    time_str = f"{time_str}:00"
                elif len(time_str) == 3:  # "830" -> "08:30"
                    time_str = f"0{time_str[0]}:{time_str[1:]}"
                elif len(time_str) == 4:  # "1430" -> "14:30"
                    time_str = f"{time_str[:2]}:{time_str[2:]}"
        
        # Handle formats with dots
        if '.' in time_str:
            time_str = time_str.replace('.', ':')
        
        # Handle formats with spaces (e.g., "8 30" -> "08:30")
        if ' ' in time_str:
            parts = time_str.split()
            if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
                time_str = f"{parts[0]}:{parts[1]}"
        
        # Ensure HH:MM format with leading zeros
        if ':' in time_str:
            parts = time_str.split(':')
            if len(parts) >= 2:
                hour = parts[0].zfill(2)  # Add leading zero if needed
                minute = parts[1].zfill(2)  # Add leading zero if needed
                
                # Validate hour and minute ranges
                if 0 <= int(hour) <= 23 and 0 <= int(minute) <= 59:
                    normalized = f"{hour}:{minute}"
                    print(f"Normalized '{time_str}' to '{normalized}'")
                    return normalized
        
        print(f"Could not normalize time format: '{time_str}'")
        return None
        
    except (ValueError, IndexError, AttributeError) as e:
        print(f"Error normalizing time '{time_str}': {e}")
        return None

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
        # Validate all time strings first
        time_strings = [start1, end1, start2, end2]
        for time_str in time_strings:
            if not validate_time_format(time_str):
                print(f"Invalid time format detected: {time_str}")
                return True
        
        # Convert to datetime.time objects for proper comparison
        s1 = datetime.strptime(start1, '%H:%M').time()
        e1 = datetime.strptime(end1, '%H:%M').time()
        s2 = datetime.strptime(start2, '%H:%M').time()
        e2 = datetime.strptime(end2, '%H:%M').time()
        
        print(f"OVERLAP CHECK: Comparing {start1}-{end1} vs {start2}-{end2}")
        print(f"  Parsed times: {s1}-{e1} vs {s2}-{e2}")
        
        # Special case: if any period has zero duration
        if s1 == e1 or s2 == e2:
            print(f"  Zero duration detected, no overlap")
            return False
        
        # CRITICAL FIX: Check for identical time slots (exact duplicates)
        if s1 == s2 and e1 == e2:
            print(f"  *** EXACT DUPLICATE DETECTED: {start1}-{end1} is identical to {start2}-{end2} ***")
            return True
        
       
        # Two periods overlap if: (start1 < end2) AND (end1 > start2)
        condition1 = s1 < e2
        condition2 = e1 > s2
        overlap_detected = condition1 and condition2
        
        print(f"  Overlap conditions: {s1} < {e2} = {condition1}, {e1} > {s2} = {condition2}")
        print(f"  Result: {'OVERLAP DETECTED' if overlap_detected else 'NO OVERLAP'}")
        
        return overlap_detected

    except (ValueError, TypeError) as e:
        print(f"Error in check_overlap: {e}")
        return True





def _calculate_free_slots_improved(occupied_slots, business_start, business_end):

    free_slots = []
    
    if not occupied_slots:
        
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

        
       
        
        # REMOVED OLD check_overlap implementation - using enhanced version only
        # This was causing conflicts to be missed because the old logic was executed first
        
        if operation == 'reallocate':
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
                    # Skip the original schedule being reallocated
                    if (schedule.get('Room ID') == original_schedule.get('Room ID') and
                        schedule.get('Start') == original_schedule.get('Start') and
                        schedule.get('End') == original_schedule.get('End') and
                        schedule.get('Course') == original_schedule.get('Course')):
                        continue
                    
                    schedule_start = schedule.get('Start')
                    schedule_end = schedule.get('End')
                    
                    # Skip schedules with invalid time format
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

        # Operation: Check overlap - ENHANCED VERSION
        elif operation == 'check_overlap':
            try:
                # Enhanced validation - allow checking without specific times
                if not room_id or not day:
                    return jsonify({'status': 'error', 'error': 'Missing required fields: room_id and day are required'}), 400

                # Optional time validation (if provided)
                if start_time and not validate_time_format(start_time):
                    return jsonify({'status': 'error', 'error': 'Invalid time format for start_time. Use HH:MM format.'}), 400
                if end_time and not validate_time_format(end_time):
                    return jsonify({'status': 'error', 'error': 'Invalid time format for end_time. Use HH:MM format.'}), 400

                print(f"Enhanced overlap check for Room: {room_id}, Day: {day}")

                
                
                # Strategy 1: Exact day match
                query_exact = {'Room ID': room_id, 'Day': day}
                schedules_exact = list(timetables.find(query_exact, {'_id': 0}))
                print(f"Strategy 1 - Exact day match: Found {len(schedules_exact)} schedules")
                
                # Strategy 2: Case-insensitive day match
                query_case_insensitive = {'Room ID': room_id, 'Day': {'$regex': f'^{day}$', '$options': 'i'}}
                schedules_case_insensitive = list(timetables.find(query_case_insensitive, {'_id': 0}))
                print(f"Strategy 2 - Case-insensitive day match: Found {len(schedules_case_insensitive)} schedules")
                
                # Strategy 3: Room only (ignore day field - useful if day data is inconsistent)
                query_room_only = {'Room ID': room_id}
                schedules_room_only = list(timetables.find(query_room_only, {'_id': 0}))
                print(f"Strategy 3 - Room only (all days): Found {len(schedules_room_only)} schedules")
                
                # Strategy 4: Find schedules with missing/null day field
                query_missing_day = {'Room ID': room_id, '$or': [{'Day': {'$exists': False}}, {'Day': None}, {'Day': ''}]}
                schedules_missing_day = list(timetables.find(query_missing_day, {'_id': 0}))
                print(f"Strategy 4 - Missing day field: Found {len(schedules_missing_day)} schedules")
                
                # Combine all unique schedules (avoid duplicates)
                all_schedules = []
                seen_schedules = set()
                
                for schedule_list in [schedules_exact, schedules_case_insensitive, schedules_missing_day]:
                    for schedule in schedule_list:
                        # Create a unique identifier for the schedule
                        schedule_id = f"{schedule.get('Room ID')}_{schedule.get('Start')}_{schedule.get('End')}_{schedule.get('Course')}_{schedule.get('Department')}"
                        if schedule_id not in seen_schedules:
                            seen_schedules.add(schedule_id)
                            all_schedules.append(schedule)
                
                print(f"TOTAL UNIQUE SCHEDULES FOUND: {len(all_schedules)}")
                
                              
                room_schedules = all_schedules

                if not room_schedules:
                    return jsonify({
                        'status': 'warning',  # Changed from 'success' to 'warning'
                        'message': f'No schedules found for Room {room_id} on {day}. This could indicate data issues.',
                        'room_id': room_id,
                        'day': day,
                        'total_schedules': 0,
                        'overlaps': [],
                        'schedule_gaps': [],
                        'debug_info': {
                            'exact_day_matches': len(schedules_exact),
                            'case_insensitive_matches': len(schedules_case_insensitive),
                            'total_room_schedules': len(schedules_room_only),
                            'missing_day_schedules': len(schedules_missing_day)
                        },
                        'utilization_analysis': {
                            'total_scheduled_time': '0h 0m',
                            'free_time': 'Full day available',
                            'utilization_percentage': 0
                        }
                    }), 200

                print(f"Found {len(room_schedules)} total schedules for Room {room_id} on {day}")

                # CRITICAL FIX: Normalize and validate schedules WITHOUT removing duplicates
                # We WANT to detect duplicate schedules as conflicts!
                normalized_schedules = []
                invalid_schedules = []
                duplicate_candidates = []
                
                for i, schedule in enumerate(room_schedules):
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
                    
                    if validate_time_format(schedule_start) and validate_time_format(schedule_end):
                        duration = time_diff_minutes(schedule_start, schedule_end)
                        if duration > 0:
                            schedule_data = {
                                'index': i,
                                'start': schedule_start,
                                'end': schedule_end,
                                'duration_minutes': duration,
                                'duration_formatted': format_duration(duration),
                                'course': schedule.get('Course', 'Unknown'),
                                'department': schedule.get('Department', 'Unknown'),
                                'lecturer': schedule.get('Lecturer', 'Unknown'),
                                'students': schedule.get('Students', 'Unknown'),
                                'room_type': schedule.get('Room Type', 'Unknown'),
                                'original_schedule': schedule  # Keep reference to original
                            }
                            
                            # Check for potential duplicates
                            time_signature = f"{schedule_start}-{schedule_end}"
                            course_signature = schedule.get('Course', 'Unknown')
                            duplicate_signature = f"{time_signature}_{course_signature}"
                            
                            # Track potential duplicates for special analysis
                            duplicate_candidates.append({
                                'signature': duplicate_signature,
                                'time_signature': time_signature,
                                'course': course_signature,
                                'schedule_data': schedule_data
                            })
                            
                            normalized_schedules.append(schedule_data)
                        else:
                            invalid_schedules.append({
                                'index': i,
                                'issue': 'Invalid duration',
                                'start': schedule_start,
                                'end': schedule_end,
                                'course': schedule.get('Course', 'Unknown')
                            })
                    else:
                        invalid_schedules.append({
                            'index': i,
                            'issue': 'Invalid time format',
                            'start': schedule_start,
                            'end': schedule_end,
                            'course': schedule.get('Course', 'Unknown')
                        })

                print(f"Normalized {len(normalized_schedules)} valid schedules, found {len(invalid_schedules)} invalid schedules")

                # DUPLICATE DETECTION ANALYSIS
                from collections import Counter
                time_signatures = [candidate['time_signature'] for candidate in duplicate_candidates]
                duplicate_time_slots = {time_sig: count for time_sig, count in Counter(time_signatures).items() if count > 1}
                
                if duplicate_time_slots:
                    print(f"DUPLICATE TIME SLOTS DETECTED: {duplicate_time_slots}")

                # Sort schedules by start time for analysis
                normalized_schedules.sort(key=lambda x: datetime.strptime(x['start'], '%H:%M').time())

                # ENHANCED OVERLAP DETECTION - CHECKS ALL PAIRS INCLUDING DUPLICATES
                overlapping_pairs = []
                all_overlaps = []
                
                print(f"\n=== STARTING OVERLAP DETECTION ===")
                print(f"Checking {len(normalized_schedules)} normalized schedules for overlaps...")
                
                for i in range(len(normalized_schedules)):
                    for j in range(i + 1, len(normalized_schedules)):
                        schedule1 = normalized_schedules[i]
                        schedule2 = normalized_schedules[j]
                        
                        print(f"\n--- COMPARISON {i+1} vs {j+1} ---")
                        print(f"Schedule {i+1}: {schedule1['course']} ({schedule1['start']}-{schedule1['end']}) - Dept: {schedule1['department']}")
                        print(f"Schedule {j+1}: {schedule2['course']} ({schedule2['start']}-{schedule2['end']}) - Dept: {schedule2['department']}")
                        
                        # CRITICAL DEBUG: Check if this is the overlap case you're looking for
                        if (schedule1['start'] == '08:00' and schedule1['end'] == '09:55') or \
                           (schedule2['start'] == '08:00' and schedule2['end'] == '09:55'):
                            print(f"🔍 FOUND TARGET TIME SLOT 08:00-09:55 - DEBUGGING CAREFULLY:")
                            print(f"  Schedule1 normalized: start='{schedule1['start']}', end='{schedule1['end']}'")
                            print(f"  Schedule2 normalized: start='{schedule2['start']}', end='{schedule2['end']}'")
                        
                        # Check if schedules overlap (including exact duplicates)
                        overlap_result = check_overlap(schedule1['start'], schedule1['end'], schedule2['start'], schedule2['end'])
                        
                        if overlap_result:
                            print(f"✅ OVERLAP CONFIRMED!")
                            
                            # Calculate overlap period
                            overlap_start = max(schedule1['start'], schedule2['start'], key=lambda t: datetime.strptime(t, '%H:%M').time())
                            overlap_end = min(schedule1['end'], schedule2['end'], key=lambda t: datetime.strptime(t, '%H:%M').time())
                            overlap_duration = time_diff_minutes(overlap_start, overlap_end)
                            
                            # Determine conflict type
                            is_exact_duplicate = (schedule1['start'] == schedule2['start'] and 
                                                schedule1['end'] == schedule2['end'])
                            
                            conflict_type = 'exact_duplicate' if is_exact_duplicate else 'partial_overlap'
                            
                            overlap_info = {
                                'conflict_type': conflict_type,
                                'schedule1': {
                                    'index': schedule1['index'],
                                    'time': f"{schedule1['start']}-{schedule1['end']}",
                                    'course': schedule1['course'],
                                    'department': schedule1['department'],
                                    'duration': schedule1['duration_formatted'],
                                    'lecturer': schedule1['lecturer']
                                },
                                'schedule2': {
                                    'index': schedule2['index'],
                                    'time': f"{schedule2['start']}-{schedule2['end']}",
                                    'course': schedule2['course'],
                                    'department': schedule2['department'],
                                    'duration': schedule2['duration_formatted'],
                                    'lecturer': schedule2['lecturer']
                                },
                                'overlap_period': f"{overlap_start}-{overlap_end}",
                                'overlap_duration': format_duration(overlap_duration),
                                'conflict_severity': 'Critical' if is_exact_duplicate else ('High' if overlap_duration >= 60 else 'Medium' if overlap_duration >= 30 else 'Low')
                            }
                            
                            overlapping_pairs.append(overlap_info)
                            conflict_description = f"{schedule1['course']} vs {schedule2['course']} ({conflict_type})"
                            all_overlaps.append(conflict_description)
                            
                            print(f"🚨 CONFLICT DETECTED: {conflict_description}")
                            print(f"   Overlap period: {overlap_start}-{overlap_end} ({format_duration(overlap_duration)})")
                            print(f"   Severity: {overlap_info['conflict_severity']}")
                        else:
                            print(f"❌ No overlap detected")
                            
                            # Additional debugging for suspected overlaps
                            if (schedule1['start'] == '08:00' and schedule1['end'] == '09:55') or \
                               (schedule2['start'] == '08:00' and schedule2['end'] == '09:55'):
                                print(f"🔍 TARGET TIME SLOT DEBUG - WHY NO OVERLAP?")
                                print(f"  This should have been flagged as an overlap!")
                                print(f"  Re-checking overlap logic manually...")
                                
                                # Manual overlap check for debugging
                                s1 = datetime.strptime(schedule1['start'], '%H:%M').time()
                                e1 = datetime.strptime(schedule1['end'], '%H:%M').time()
                                s2 = datetime.strptime(schedule2['start'], '%H:%M').time()
                                e2 = datetime.strptime(schedule2['end'], '%H:%M').time()
                                
                                print(f"  Manual check: s1={s1}, e1={e1}, s2={s2}, e2={e2}")
                                print(f"  s1 < e2: {s1 < e2}")
                                print(f"  e1 > s2: {e1 > s2}")
                                print(f"  s1 == s2 and e1 == e2: {s1 == s2 and e1 == e2}")

                print(f"\n=== OVERLAP DETECTION COMPLETE ===")
                print(f"FINAL RESULT: Found {len(overlapping_pairs)} conflicts total")
                
                if len(overlapping_pairs) == 0:
                    print(f"⚠️  NO CONFLICTS DETECTED - This might indicate a logic error!")
                    print(f"   Schedules analyzed: {len(normalized_schedules)}")
                    print(f"   If you expected conflicts, check the debug output above.")
                else:
                    print(f"✅ CONFLICTS FOUND:")
                    for i, conflict in enumerate(overlapping_pairs):
                        print(f"   {i+1}. {conflict['schedule1']['course']} vs {conflict['schedule2']['course']} " +
                              f"({conflict['conflict_type']}) - {conflict['overlap_period']}")

                print(f"=== END OVERLAP ANALYSIS ===\n")

                # SCHEDULE GAP ANALYSIS (free time between schedules)
                business_start, business_end = get_business_hours(day)
                free_slots = _calculate_free_slots_improved(normalized_schedules, business_start, business_end)
                
                # UTILIZATION CALCULATION
                total_scheduled_minutes = sum(schedule['duration_minutes'] for schedule in normalized_schedules)
                business_hours_minutes = time_diff_minutes(business_start, business_end)
                utilization_percentage = (total_scheduled_minutes / business_hours_minutes * 100) if business_hours_minutes > 0 else 0

                # SPECIFIC TIME SLOT CHECK (if provided)
                specific_time_analysis = None
                if start_time and end_time:
                    conflicts_with_requested = []
                    for schedule in normalized_schedules:
                        if check_overlap(start_time, end_time, schedule['start'], schedule['end']):
                            conflicts_with_requested.append({
                                'course': schedule['course'],
                                'time': f"{schedule['start']}-{schedule['end']}",
                                'department': schedule['department']
                            })
                    
                    specific_time_analysis = {
                        'requested_time': f"{start_time}-{end_time}",
                        'is_available': len(conflicts_with_requested) == 0,
                        'conflicts': conflicts_with_requested,
                        'recommendation': 'Available for booking' if len(conflicts_with_requested) == 0 else f'Conflicts with {len(conflicts_with_requested)} existing schedule(s)'
                    }

                # OPTIMIZATION RECOMMENDATIONS
                recommendations = []
                if len(overlapping_pairs) > 0:
                    recommendations.append(f"🚨 Found {len(overlapping_pairs)} schedule conflicts that need resolution")
                if utilization_percentage > 85:
                    recommendations.append("📊 Room is over-utilized (>85%). Consider redistributing some classes.")
                elif utilization_percentage < 40:
                    recommendations.append("📈 Room is under-utilized (<40%). Could accommodate more classes.")
                if len(free_slots) > 3:
                    recommendations.append(f"⏰ {len(free_slots)} free time slots available for additional scheduling.")
                if len(invalid_schedules) > 0:
                    recommendations.append(f"⚠️ {len(invalid_schedules)} schedules have data quality issues.")

                return jsonify({
                    'status': 'success',
                    'message': f'Comprehensive overlap analysis completed for Room {room_id} on {day}',
                    'room_id': room_id,
                    'day': day,
                    'date': date,
                    'analysis_type': 'comprehensive' if not (start_time and end_time) else 'specific_time_check',
                    
                    # Schedule Summary
                    'schedule_summary': {
                        'total_schedules': len(normalized_schedules),
                        'valid_schedules': len(normalized_schedules),
                        'invalid_schedules': len(invalid_schedules),
                        'total_overlaps': len(overlapping_pairs)
                    },
                    
                    # Overlap Analysis
                    'overlap_analysis': {
                        'has_overlaps': len(overlapping_pairs) > 0,
                        'total_conflicts': len(overlapping_pairs),
                        'overlapping_pairs': overlapping_pairs,
                        'conflict_summary': all_overlaps
                    },
                    
                    # Time Utilization
                    'utilization_analysis': {
                        'total_scheduled_time': format_duration(total_scheduled_minutes),
                        'business_hours': f"{business_start}-{business_end}",
                        'total_business_time': format_duration(business_hours_minutes),
                        'utilization_percentage': round(utilization_percentage, 1),
                        'utilization_status': 'High' if utilization_percentage > 75 else 'Medium' if utilization_percentage > 40 else 'Low'
                    },
                    
                    # Free Time Slots
                    'free_time_analysis': {
                        'total_free_slots': len(free_slots),
                        'free_slots': free_slots,
                        'longest_free_period': max([slot['duration'] for slot in free_slots], default='0m')
                    },
                    
                    # All Schedules
                    'all_schedules': normalized_schedules,
                    
                    # Data Quality Issues
                    'data_quality': {
                        'invalid_schedules': invalid_schedules,
                        'total_invalid': len(invalid_schedules)
                    },
                    
                    # Specific Time Analysis (if requested)
                    'specific_time_check': specific_time_analysis,
                    
                    # Recommendations
                    'recommendations': recommendations,
                    
                    # Meta Information
                    'generated_at': datetime.now().isoformat(),
                    'analysis_duration': 'comprehensive_room_day_analysis'
                    
                }), 200
                
            except Exception as e:
                print(f"Error in enhanced check_overlap: {str(e)}")
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

