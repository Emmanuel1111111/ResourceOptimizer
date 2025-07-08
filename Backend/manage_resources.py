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
            if not all([room_id, date, start_time, end_time]):
                return jsonify({'status': 'error', 'error': 'Missing required fields: room_id, date, start_time, end_time'}), 400

            
            if not validate_time_format(start_time) or not validate_time_format(end_time):
                return jsonify({'status': 'error', 'error': 'Invalid time format for start_time or end_time. Use HH:MM format.'}), 400

           
            
            print(f"Checking for conflicts on {day} for room {room_id}")
                
            
            
            
            query_day = {'Room ID': room_id, 'Day': day}
            existing_schedules_by_day = list(timetables.find(query_day, {'_id': 0}))
            
            
            if not existing_schedules_by_day:
                query_date = {'Room ID': room_id, 'Date': date}
                existing_schedules_by_date = list(timetables.find(query_date, {'_id': 0}))
                existing_schedules = existing_schedules_by_date
            else:
                existing_schedules = existing_schedules_by_day
            
            print(f"Found {len(existing_schedules)} potential conflicts for room {room_id} on {day} ({date})")

            conflicts = []
            for schedule in existing_schedules:
                # Get schedule details
                schedule_start = schedule.get('Start')
                schedule_end = schedule.get('End')
                schedule_day = schedule.get('Day', 'Unknown')
                schedule_date = schedule.get('Date', 'Unknown')
                schedule_course = schedule.get('Course', 'Unknown'),
                schedule_department= schedule.get('Department', 'Unknown')
                
               
                if isinstance(schedule_start, str) and '–' in schedule_start:
                    time_parts = schedule_start.split('–')
                    if len(time_parts) == 2:
                        schedule_start = time_parts[0].strip()
                       
                        if not schedule_end or not isinstance(schedule_end, str):
                            schedule_end = time_parts[1].strip()
                
                
                schedule_start = normalize_time_format(schedule_start)
                schedule_end = normalize_time_format(schedule_end)
                
                print(f"Checking schedule: Room={room_id}, Day={schedule_day}, Date={schedule_date}, " +
                      f"Time={schedule_start}-{schedule_end}, Course={schedule_course}")
                
                if not validate_time_format(schedule_start) or not validate_time_format(schedule_end):
                    
                    print(f"  → Skipping due to invalid time format")
                    continue
                
                overlap = check_overlap(start_time, end_time, schedule_start, schedule_end)
                print(f"  → Overlap result: {overlap}")
                
               
                if schedule_day != day and schedule_day != "Unknown":
                    print(f"  → Skipping due to day mismatch: schedule day '{schedule_day}' != requested day '{day}'")
                    continue
                
                if overlap:
                    conflict_info = {
                        'schedule_id': schedule.get('Room ID', 'Unknown'),
                        'course': schedule_course,
                        'time': f"{schedule_start}-{schedule_end}",
                        'day': schedule_day,
                        'date': schedule_date,
                        'department': schedule_department
                    }
                    conflicts.append(conflict_info)
                    print(f"  → CONFLICT DETECTED: {conflict_info}")
                else:
                    print(f"  → No conflict")
            
            # Pagination parameters
            page = int(data.get('page', 1))
            per_page = int(data.get('per_page', 10))  
            
            # Ensure valid pagination parameters
            if page < 1:
                page = 1
            if per_page < 1 or per_page > 50:  # Limit max items per page
                per_page = 10
            
            # Apply pagination to conflicts
            total_count = len(conflicts)
            start_idx = (page - 1) * per_page
            end_idx = start_idx + per_page
            paginated_conflicts = conflicts[start_idx:end_idx]
            
            # Calculate pagination metadata
            total_pages = (total_count + per_page - 1) // per_page if total_count > 0 else 1  # Ceiling division
            has_next = page < total_pages
            has_prev = page > 1

            
            return jsonify({
                'status': 'success',
                'message': 'Overlap check completed',
                'room_id': room_id,
                'day': day,  
                'date': date,
                'proposed_time': f'{start_time}-{end_time}',
                'has_conflict': bool(conflicts),
                'conflicts': paginated_conflicts,
                'schedules_checked': len(existing_schedules),
                'search_method': 'day_based' if existing_schedules_by_day else 'date_based',
                'pagination': {
                    'page': page,
                    'per_page': per_page,
                    'total_items': total_count,
                    'total_pages': total_pages,
                    'has_next': has_next,
                    'has_prev': has_prev
                }
            }), 200

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

            # Validate new schedule
            new_room_id = new_schedule.get('room_id')
            new_date = new_schedule.get('date', original_date)
            new_start_time = new_schedule.get('start_time')
            new_end_time = new_schedule.get('end_time')
            new_day = new_schedule.get('day')
            
            # Get course information fields
            new_course = new_schedule.get('course', original_schedule.get('Course', 'Unknown'))
            new_department = new_schedule.get('department', original_schedule.get('Department', 'Unknown'))
            new_year = new_schedule.get('year', original_schedule.get('Year', 'Unknown'))
            new_status = new_schedule.get('status', original_schedule.get('Status', 'Booked'))
            new_lecturer = new_schedule.get('lecturer', original_schedule.get('Lecturer', 'Unknown'))

            if not all([new_room_id, new_start_time, new_end_time, new_day]):
                return jsonify({'status': 'error', 'error': 'Missing required fields in new_schedule: room_id, start_time, end_time, day'}), 400

            # Validate new schedule time formats
            if not validate_time_format(new_start_time) or not validate_time_format(new_end_time):
                return jsonify({'status': 'error', 'error': 'Invalid time format in new_schedule. Use HH:MM format.'}), 400

            # Check overlap in new room
            new_room_query = {'Room ID': new_room_id, 'Day': new_day}
            existing_schedules = list(timetables.find(new_room_query, {'_id': 0}))

            conflicts = []
            for schedule in existing_schedules:
                # Skip the current schedule being moved (using the original schedule's _id for exact match)
                if schedule.get('_id') == original_schedule.get('_id'):
                    continue
                    
                schedule_start = schedule.get('Start')
                schedule_end = schedule.get('End')
                
                # Skip schedules with invalid time formats
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

            # Pagination parameters for conflicts
            page = int(data.get('page', 1))
            per_page = int(data.get('per_page', 10))  # Default 10 items per page
            
            # Ensure valid pagination parameters
            if page < 1:
                page = 1
            if per_page < 1 or per_page > 50:  # Limit max items per page
                per_page = 10
            
            # Apply pagination to conflicts
            total_count = len(conflicts)
            start_idx = (page - 1) * per_page
            end_idx = start_idx + per_page
            paginated_conflicts = conflicts[start_idx:end_idx]
            
            # Calculate pagination metadata
            total_pages = (total_count + per_page - 1) // per_page if total_count > 0 else 1  # Ceiling division
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

            # Update the specific schedule using the original query to ensure we update the right one
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
            result = timetables.update_one(query, update)  # Use the specific query instead of just {'Room ID': schedule_id}

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

                # Create new schedule document
                new_schedule_doc = {
                    'Room ID': room_id,
                    'Date': date if date else datetime.now().strftime('%Y-%m-%d'),  
                    'Start': start_time,
                    'End': end_time,
                    'Day': day,
                    'Course': data.get('course', 'Unknown'),
                    'Department': data.get('department', 'Unknown'),
                    'Lecturer': data.get('instructor', 'Unknown'),
                    'Year': data.get('year', 'Unknown'),
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
                
        # Operation: Suggest rooms
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

                # Get all rooms or filter by specified room_id
                if room_id:
                    all_rooms = [room_id]
                else:
                    all_rooms = list(timetables.distinct('Room ID'))
                
                # Find available rooms with their free time slots
                available_rooms = []
                
                for room in all_rooms:
                    # Get all schedules for this room on the specified day
                    query = {'Room ID': room, 'Day': day}
                    schedules = list(timetables.find(query, {'_id': 0}))
                    
                    # Calculate free time slots for this room
                    free_slots = []
                    
                    # Define standard business hours
                    business_start = '08:00'
                    business_end = '20:00'
                    
                    # Convert all schedules to time slots
                    occupied_slots = []
                    for schedule in schedules:
                        schedule_start = schedule.get('Start')
                        schedule_end = schedule.get('End')
                        
                        if validate_time_format(schedule_start) and validate_time_format(schedule_end):
                            occupied_slots.append({
                                'start': schedule_start,
                                'end': schedule_end,
                                'course': schedule.get('Course', 'Unknown')
                            })
                    
                    # Sort occupied slots by start time
                    occupied_slots.sort(key=lambda x: x['start'])
                    
                    # Find free slots
                    if not occupied_slots:
                        # If no occupied slots, the entire day is free
                        free_slots.append({
                            'start': business_start,
                            'end': business_end,
                            'duration': format_duration(time_diff_minutes(business_start, business_end))
                        })
                    else:
                        # Check if there's free time before the first occupied slot
                        first_occupied = occupied_slots[0]
                        if first_occupied['start'] > business_start:
                            duration_mins = time_diff_minutes(business_start, first_occupied['start'])
                            free_slots.append({
                                'start': business_start,
                                'end': first_occupied['start'],
                                'duration': format_duration(duration_mins)
                            })
                        
                        # Check for gaps between occupied slots
                        for i in range(len(occupied_slots) - 1):
                            current_end = occupied_slots[i]['end']
                            next_start = occupied_slots[i + 1]['start']
                            
                            if current_end < next_start:
                                duration_mins = time_diff_minutes(current_end, next_start)
                                free_slots.append({
                                    'start': current_end,
                                    'end': next_start,
                                    'duration': format_duration(duration_mins)
                                })
                        
                        # Check if there's free time after the last occupied slot
                        last_occupied = occupied_slots[-1]
                        if last_occupied['end'] < business_end:
                            duration_mins = time_diff_minutes(last_occupied['end'], business_end)
                            free_slots.append({
                                'start': last_occupied['end'],
                                'end': business_end,
                                'duration': format_duration(duration_mins)
                            })
                    
                    # Check if the room is available during the requested time
                    is_available = True
                    for schedule in schedules:
                        schedule_start = schedule.get('Start')
                        schedule_end = schedule.get('End')
                        
                        # Skip schedules with invalid time formats
                        if not validate_time_format(schedule_start) or not validate_time_format(schedule_end):
                            continue
                            
                        if has_time_overlap(start_time, end_time, schedule_start, schedule_end):
                            is_available = False
                            break
                    
                    if is_available:
                        # Add room to available rooms list with free slots
                        room_info = {
                            'room_id': room,
                            'status': 'Available',
                            'free_slots': free_slots,
                            'requested_slot': {
                                'start': start_time,
                                'end': end_time,
                                'duration': format_duration(time_diff_minutes(start_time, end_time))
                            }
                        }
                        
                        available_rooms.append(room_info)
                
                return jsonify({
                    'status': 'success',
                    'message': f'Found {len(available_rooms)} available rooms',
                    'date': date,
                    'day': day,
                    'time': f"{start_time}-{end_time}",
                    'suggested_rooms': available_rooms,
                    'total_rooms': len(available_rooms)
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

# Helper function to calculate time difference in minutes
def time_diff_minutes(start_time, end_time):
    try:
        start_dt = datetime.strptime(start_time, '%H:%M')
        end_dt = datetime.strptime(end_time, '%H:%M')
        
        # Calculate difference in minutes
        diff = (end_dt - start_dt).total_seconds() / 60
        return max(0, diff)  # Ensure non-negative
    except Exception as e:
        print(f"Error calculating time difference: {e}")
        return 0

# Helper function to format duration
def format_duration(minutes):
    hours = int(minutes // 60)
    mins = int(minutes % 60)
    
    if hours > 0 and mins > 0:
        return f"{hours}h {mins}m"
    elif hours > 0:
        return f"{hours}h"
    else:
        return f"{mins}m"

