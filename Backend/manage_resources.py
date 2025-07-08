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

# Setup Flask blueprint and MongoDB
manage_resources_bp = Blueprint('routes_bp', __name__)
MONGO_URI = os.getenv("MONGO_URI")
client = MongoClient(MONGO_URI)
db = client['EduResourceDB']
timetables = db['timetables']
 # Assuming you have a rooms collection
# Note: You'll need to define preprocess_data and is_within_time_and_day functions

def validate_time_format(time_str):
    """
    Validate time format and return True if valid, False otherwise.
    """
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
    """
    Normalize different time formats to HH:MM format.
    Handles formats like "8:00", "08:00", "8:00–9:55" (with en dash)
    """
    if not time_str or not isinstance(time_str, str):
        return time_str
    
    print(f"Normalizing time format: '{time_str}'")
    
    # Handle special characters like en dash or em dash that might be in the data
    if '–' in time_str:  # en dash (common in the provided data)
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
    
    # Try to parse hour and minute
    try:
        # If it's just a number, assume it's hours
        if time_str.isdigit():
            result = f"{int(time_str):02d}:00"
            print(f"  → Converted digit to time: '{result}'")
            return result
        
        # If it has a colon, try to format properly
        if ':' in time_str:
            hour, minute = time_str.split(':')
            result = f"{int(hour):02d}:{int(minute):02d}"
            print(f"  → Formatted with leading zeros: '{result}'")
            return result
    except (ValueError, TypeError) as e:
        print(f"  → Error parsing time: {e}")
    
    # If we can't normalize it, return as is
    print(f"  → Could not normalize, returning as is: '{time_str}'")
    return time_str

def has_time_overlap(start1, end1, start2, end2):
    """
    A more robust helper function to check if two time periods overlap.
    This function specifically handles the case where one period ends exactly 
    when another begins (which should NOT count as an overlap).
    
    Args:
        start1, end1: Start and end times of first period (HH:MM format)
        start2, end2: Start and end times of second period (HH:MM format)
        
    Returns:
        bool: True if there is an overlap, False otherwise
    """
    try:
        # Convert strings to datetime.time objects
        s1 = datetime.strptime(start1, '%H:%M').time()
        e1 = datetime.strptime(end1, '%H:%M').time()
        s2 = datetime.strptime(start2, '%H:%M').time()
        e2 = datetime.strptime(end2, '%H:%M').time()
        
        # If either period has zero duration, no overlap
        if s1 == e1 or s2 == e2:
            return False
            
        # IMPORTANT: The key comparison - specifically exclude the case
        # where one period ends exactly when another begins
        if e1 == s2 or e2 == s1:
            return False
            
        # Standard overlap check
        return s1 < e2 and e1 > s2
        
    except (ValueError, TypeError) as e:
        print(f"Error in has_time_overlap: {e}")
        # Return True to be safe
        return True

def serialize_mongo_doc(doc):
    """
    Serialize a MongoDB document for JSON response.
    Converts ObjectId to string and handles other non-serializable types.
    
    Args:
        doc: MongoDB document (dict)
        
    Returns:
        dict: Serialized document safe for JSON conversion
    """
    if not doc:
        return doc
        
    serialized = {}
    for key, value in doc.items():
        # Handle ObjectId
        if key == '_id' and isinstance(value, ObjectId):
            serialized[key] = str(value)
        # Handle nested documents
        elif isinstance(value, dict):
            serialized[key] = serialize_mongo_doc(value)
        # Handle lists of documents
        elif isinstance(value, list) and all(isinstance(item, dict) for item in value):
            serialized[key] = [serialize_mongo_doc(item) for item in value]
        # Handle other types
        else:
            serialized[key] = value
            
    return serialized

def check_overlap(start1, end1, start2, end2):
    """
    Check if two time periods overlap.
    Returns True if there is an overlap, False otherwise.
    Also returns False if any time format is invalid.
    """
    try:
        # Validate all time strings first
        time_strings = [start1, end1, start2, end2]
        for time_str in time_strings:
            if not validate_time_format(time_str):
                print(f"Invalid time format detected: {time_str}")
                # Return True to be safe (assume there could be an overlap)
                # This prevents scheduling when we can't validate times
                return True
        
        # Convert to datetime.time objects for proper comparison
        # Use datetime.strptime instead of pandas for more reliable parsing
        s1 = datetime.strptime(start1, '%H:%M').time()
        e1 = datetime.strptime(end1, '%H:%M').time()
        s2 = datetime.strptime(start2, '%H:%M').time()
        e2 = datetime.strptime(end2, '%H:%M').time()
        
        # Special case: if any period has zero duration
        if s1 == e1 or s2 == e2:
            # Zero duration periods can't overlap
            return False
        
        # Check overlap: two periods overlap if:
        # (start1 < end2) AND (end1 > start2)
        # This excludes the case where one period starts exactly when another ends
        return s1 < e2 and e1 > s2
        
    except (ValueError, TypeError) as e:
        print(f"Error in check_overlap: {e}")
        # Return True to be safe (assume there could be an overlap)
        return True

@manage_resources_bp.route('/manage_resources', methods=['POST'])
def manage_resources():
   
    try:
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

        
        # Check if day parameter was explicitly provided in the request
        day_provided_in_request = 'day' in data and data['day']
        
        # If date is provided, validate it and get the day of week
        if date:
            try:
                date_obj = datetime.strptime(date, '%Y-%m-%d')
                inferred_day = date_obj.strftime('%A')
                
                # Only override the day if it wasn't explicitly provided in the request
                if not day_provided_in_request:
                    day = inferred_day
                    print(f"Day not provided in request, using inferred day: {day}")
                else:
                    print(f"Using day provided in request: {day} (inferred from date: {inferred_day})")
            except ValueError:
                return jsonify({'error': 'Invalid date format, use YYYY-MM-DD'}), 400
        
        # Ensure day is valid
        valid_days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        if day not in valid_days:
            return jsonify({'error': f'Invalid day format. Must be one of: {", ".join(valid_days)}'}), 400
            
        print(f"Final day used for scheduling: {day}")

        
        # Operation: Check availability
        
        if operation == 'check_overlap':
            if not all([room_id, date, start_time, end_time]):
                return jsonify({'status': 'error', 'error': 'Missing required fields: room_id, date, start_time, end_time'}), 400

            
            if not validate_time_format(start_time) or not validate_time_format(end_time):
                return jsonify({'status': 'error', 'error': 'Invalid time format for start_time or end_time. Use HH:MM format.'}), 400

            # Use the day parameter that was already processed above
            # This will be either the explicitly provided day or the one inferred from the date
            
            print(f"Checking for conflicts on {day} for room {room_id}")
                
            # IMPORTANT: Since the schedule is primarily organized by day of week,
            # we should prioritize day-based scheduling over specific dates
            
            # First query by day of week - using the provided/inferred day
            query_day = {'Room ID': room_id, 'Day': day}
            existing_schedules_by_day = list(timetables.find(query_day, {'_id': 0}))
            
            # Only if no day-based schedules are found, check for date-specific schedules
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
                schedule_course = schedule.get('Course', 'Unknown')
                
                # Handle different time formats - normalize to HH:MM if needed
                # For the specific format in your data "08:00–09:55", we need to extract both parts
                if isinstance(schedule_start, str) and '–' in schedule_start:
                    time_parts = schedule_start.split('–')
                    if len(time_parts) == 2:
                        schedule_start = time_parts[0].strip()
                        # Only update end time if it's not already set
                        if not schedule_end or not isinstance(schedule_end, str):
                            schedule_end = time_parts[1].strip()
                
                # Now normalize both times
                schedule_start = normalize_time_format(schedule_start)
                schedule_end = normalize_time_format(schedule_end)
                
                print(f"Checking schedule: Room={room_id}, Day={schedule_day}, Date={schedule_date}, " +
                      f"Time={schedule_start}-{schedule_end}, Course={schedule_course}")
                
                if not validate_time_format(schedule_start) or not validate_time_format(schedule_end):
                    # Skip schedules with invalid time formats
                    print(f"  → Skipping due to invalid time format")
                    continue
                
                overlap = check_overlap(start_time, end_time, schedule_start, schedule_end)
                print(f"  → Overlap result: {overlap}")
                
                # Make sure we're checking the right day
                if schedule_day != day and schedule_day != "Unknown":
                    print(f"  → Skipping due to day mismatch: schedule day '{schedule_day}' != requested day '{day}'")
                    continue
                
                if overlap:
                    conflict_info = {
                        'schedule_id': schedule.get('Room ID', 'Unknown'),
                        'course': schedule_course,
                        'time': f"{schedule_start}-{schedule_end}",
                        'day': schedule_day,
                        'date': schedule_date
                    }
                    conflicts.append(conflict_info)
                    print(f"  → CONFLICT DETECTED: {conflict_info}")
                else:
                    print(f"  → No conflict")
            
            # Pagination parameters
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

            # Create a clear response with day of week as the primary factor
            return jsonify({
                'status': 'success',
                'message': 'Overlap check completed',
                'room_id': room_id,
                'day': day,  # List day first as it's more important
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

        # Operation: Reallocate schedule
        elif operation == 'reallocate':
            if not schedule_id or not new_schedule:
                return jsonify({'status': 'error', 'error': 'Missing schedule_id or new_schedule'}), 400

            # No need to convert to ObjectId if we're using Room ID
            # First, retrieve the original schedule to get its date
            original_schedule = timetables.find_one({'Room ID': schedule_id})
            if not original_schedule:
                return jsonify({'status': 'error', 'error': 'Schedule not found'}), 404
            
            original_date = original_schedule.get('Date')

            # Validate new schedule
            new_room_id = new_schedule.get('room_id')
            # Use original date if not provided in new_schedule
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
            query = {'Room ID': new_room_id, 'Day': new_day}
            existing_schedules = list(timetables.find(query, {'_id': 0}))

            conflicts = []
            for schedule in existing_schedules:
                if schedule.get('Room ID') != schedule_id:  # Exclude the current schedule
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
                            'time': f"{schedule_start}-{schedule_end}"
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

            # Update schedule
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
            result = timetables.update_one({'Room ID': schedule_id}, update)

            if result.matched_count == 0:
                return jsonify({'status': 'error', 'error': 'Schedule not found'}), 404

            return jsonify({
                'status': 'success',
                'message': 'Schedule reallocated successfully',
                'schedule_id': schedule_id,
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
    
                # Check for conflicts before injection - use the day parameter instead of date
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
                    
                    # Use our robust overlap detection
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
                    'Date': date if date else datetime.now().strftime('%Y-%m-%d'),  # Use current date if not provided
                    'Start': start_time,
                    'End': end_time,
                    'Day': day,
                    'Course': data.get('course', 'Unknown'),
                    'Department': data.get('department', 'Unknown'),
                    'Lecturer': data.get('instructor', 'Unknown'),
                    'Year': data.get('year', 'Unknown'),
                    'Status': data.get('status', 'Booked')
                }
    
                # Insert into database
                result = timetables.insert_one(new_schedule_doc)
                
                # Serialize the document for JSON response
                response_doc = serialize_mongo_doc(new_schedule_doc)
                
                # Refresh aggregated data for this room
                try:
                    # Get all schedules for this room to recalculate aggregations
                    all_room_schedules = list(timetables.find({'Room ID': room_id}, {'_id': 0}))
                    
                    if all_room_schedules:
                        # Convert to DataFrame
                        df = pd.DataFrame(all_room_schedules)
                        # Apply preprocessing to regenerate aggregated data
                        _, daily_summary, weekly_summary = preprocess_data(df)
                        
                        # Filter for just this room
                        daily_summary_df = daily_summary[daily_summary['Room ID'] == room_id]
                        weekly_summary_df = weekly_summary[weekly_summary['Room ID'] == room_id]
                        
                        # Add the refreshed data to the response
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
                    # If refresh fails, still return success for the injection
                
                # Default response if refresh fails
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
                per_page = int(data.get('per_page', 10))  # Default 10 items per page
                
                # Ensure valid pagination parameters
                if page < 1:
                    page = 1
                if per_page < 1 or per_page > 50:  # Limit max items per page
                    per_page = 10
                
                # Calculate skip value for pagination
                skip = (page - 1) * per_page
                
                # Use day if provided, otherwise get all schedules
                query = {'Room ID': room_id}
                if day:
                    query['Day'] = day
                
                # Get total count for pagination info
                total_count = timetables.count_documents(query)
                
                # Get paginated schedules for this room and day
                schedules = list(timetables.find(query, {'_id': 0}).skip(skip).limit(per_page))
                
                # Format times consistently for display
                for schedule in schedules:
                    start = schedule.get('Start', '')
                    end = schedule.get('End', '')
                    if start and end:
                        schedule['Time'] = f"{start}–{end}"  # Using en dash for consistency
                
                # Serialize for JSON response
                serialized_schedules = [serialize_mongo_doc(s) for s in schedules]
                
                # Calculate pagination metadata
                total_pages = (total_count + per_page - 1) // per_page  # Ceiling division
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
                # Check required parameters
                if not day or not room_id:
                    return jsonify({'status': 'error', 'error': 'Missing required fields: day, room_id'}), 400

                # If date is provided, validate it
                if date:
                    try:
                        date_obj = datetime.strptime(date, '%Y-%m-%d')
                        # Skip weekends if date is provided
                        if date_obj.weekday() >= 5:  # Saturday=5, Sunday=6
                            return jsonify({'status': 'success', 'message': 'No room suggestions for weekends', 'free_slots': []}), 200
                    except ValueError:
                        return jsonify({'status': 'error', 'error': 'Invalid date format'}), 400
                else:
                    # If no date provided, use current date
                    date = datetime.now().strftime('%Y-%m-%d')

                # Validate time formats if provided
                if start_time and not validate_time_format(start_time):
                    return jsonify({'status': 'error', 'error': 'Invalid time format for start_time. Use HH:MM format.'}), 400
                if end_time and not validate_time_format(end_time):
                    return jsonify({'status': 'error', 'error': 'Invalid time format for end_time. Use HH:MM format.'}), 400

                # Define standard time slots for the day (8:00 AM to 8:00 PM in 1-hour blocks)
                standard_slots = []
                for hour in range(8, 20):  # 8 AM to 8 PM
                    start = f"{hour:02d}:00"
                    end = f"{hour+1:02d}:00"
                    standard_slots.append({
                        'start': start,
                        'end': end,
                        'slot': f"{start}-{end}"
                    })

                # Fetch schedules for the specified room and day
                query = {'Room ID': room_id, 'Day': day}
                schedules = list(timetables.find(query, {'_id': 0}))
                
                # Get room details
                room_details = timetables.find_one({'Room ID': room_id}, {'_id': 0})
                if not room_details:
                    return jsonify({'status': 'error', 'error': f'Room {room_id} not found'}), 404
                
                # Find booked slots
                booked_slots = []
                for schedule in schedules:
                    schedule_start = schedule.get('Start')
                    schedule_end = schedule.get('End')
                    
                    # Skip schedules with invalid time formats
                    if not validate_time_format(schedule_start) or not validate_time_format(schedule_end):
                        print(f"Skipping schedule with invalid time format: Start={schedule_start}, End={schedule_end}")
                        continue
                    
                    booked_slots.append({
                        'start': schedule_start,
                        'end': schedule_end,
                        'slot': f"{schedule_start}-{schedule_end}",
                        'course': schedule.get('Course', 'Unknown'),
                        'lecturer': schedule.get('Lecturer', 'Unknown')
                    })
                
                # Find free slots by checking each standard slot against booked slots
                free_slots = []
                for slot in standard_slots:
                    is_free = True
                    for booked in booked_slots:
                        if has_time_overlap(slot['start'], slot['end'], booked['start'], booked['end']):
                            is_free = False
                            break
                    
                    if is_free:
                        free_slots.append(slot)
                
                # If specific start_time and end_time are provided, check if that slot is free
                specific_slot_status = None
                if start_time and end_time:
                    is_specific_slot_free = True
                    for booked in booked_slots:
                        if has_time_overlap(start_time, end_time, booked['start'], booked['end']):
                            is_specific_slot_free = False
                            specific_slot_status = {
                                'is_free': False,
                                'conflicting_booking': booked
                            }
                            break
                    
                    if is_specific_slot_free:
                        specific_slot_status = {
                            'is_free': True,
                            'start': start_time,
                            'end': end_time,
                            'slot': f"{start_time}-{end_time}"
                        }
                
                # Pagination parameters for free slots
                page = int(data.get('page', 1))
                per_page = int(data.get('per_page', 10))  # Default 10 items per page
                
                # Ensure valid pagination parameters
                if page < 1:
                    page = 1
                if per_page < 1 or per_page > 50:  # Limit max items per page
                    per_page = 10
                
                # Apply pagination
                total_count = len(free_slots)
                start_idx = (page - 1) * per_page
                end_idx = start_idx + per_page
                paginated_slots = free_slots[start_idx:end_idx]
                
                # Calculate pagination metadata
                total_pages = (total_count + per_page - 1) // per_page if total_count > 0 else 1  # Ceiling division
                has_next = page < total_pages
                has_prev = page > 1
                
                # Return room details with free slots
                return jsonify({
                    'status': 'success',
                    'message': f'Found {len(free_slots)} free time slots for room {room_id} on {day}',
                    'room_id': room_id,
                    'department': room_details.get('Department', 'Unknown'),
                    'day': day,
                    'date': date,
                    'free_slots': paginated_slots,
                    'booked_slots': booked_slots,
                    'specific_slot_status': specific_slot_status,
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
                print(f"Error in suggest_rooms: {str(e)}")
                return jsonify({'status': 'error', 'error': f'Unexpected error in suggest_rooms: {str(e)}'}), 500

        else:
            return jsonify({'status': 'error', 'error': f'Invalid operation: {operation}'}), 400

    except KeyError as e:
        return jsonify({'status': 'error', 'error': f'Key error: {str(e)}'}), 400
    except PyMongoError as e:
        return jsonify({'status': 'error', 'error': f'Database error: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'status': 'error', 'error': f'Unexpected error: {str(e)}'}), 500


    