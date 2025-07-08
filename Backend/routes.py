from flask import Blueprint, request, jsonify
from pymongo import MongoClient
import pandas as pd
from prophet import Prophet
from datetime import datetime, timedelta
from flask_jwt_extended import jwt_required
import os
from process import preprocess_data
from flask import current_app
from dotenv import load_dotenv
load_dotenv()

routes_bp = Blueprint('routes', __name__)


# MongoDB Atlas Connection
MONGO_URI = os.getenv("MONGO_URI")

client = MongoClient(MONGO_URI)
db = client.EduResourceDB
timetables_collection = db.timetables

@routes_bp.route('/available_rooms', methods=['GET'])
def get_available_rooms():
    try:
        room_id = request.args.get('room_id')
       
        # Fetch data from MongoDB
        query = {}
        if room_id:
            query['Room ID'] = room_id
        raw_data = list(timetables_collection.find(query, {'_id': 0}))
        if not raw_data:
            return jsonify({"status": "error", "error": "No data found for the given filters"}), 404

        # Convert to DataFrame
        df = pd.DataFrame(raw_data)
        if df.empty:
            return jsonify({"status": "error", "error": "No data found after processing"}), 404

        # Apply preprocessing
        df, daily_summary, weekly_summary = preprocess_data(df)
        df = df.dropna(subset=['Start', 'End'])

        # Time-based filtering
        now_time = datetime.now().time()
        now_day = datetime.now().strftime('%A')  
        buffer = timedelta(minutes=5)

        df['Start_dt'] = pd.to_datetime(df['Start'], format='%H:%M', errors='coerce').dt.time
        df['End_dt'] = pd.to_datetime(df['End'], format='%H:%M', errors='coerce').dt.time

        def is_within_time_and_day(start, end, day, current_time,current_day):
            try:
                start_buffer = (datetime.combine(datetime.today(), start)).time()
                end_buffer = (datetime.combine(datetime.today(), end) ).time()
                
                return (day == current_day) and (start_buffer <=current_time<= end_buffer)
            except Exception:
                return False

        df['Matches_Current_Time'] = df.apply(
            lambda row: is_within_time_and_day(
                row['Start_dt'], row['End_dt'], row['Day'], now_time, now_day
            ),
            axis=1
        )
        print(f"Current time matches found: {df['Matches_Current_Time']}")

        current_time_df = df[df['Matches_Current_Time'] == True][
            ['Room ID', 'Course', 'Start', 'End', 'Day', 'Status', 'Year', 'Department']
        ]

        if room_id:
            utilization_df = df[df['Room ID'] == room_id]
            daily_summary_df = daily_summary[daily_summary['Room ID'] == room_id]
            weekly_summary_df = weekly_summary[weekly_summary['Room ID'] == room_id]
            current_time_df = current_time_df[current_time_df['Room ID'] == room_id]

            if utilization_df.empty:
                return jsonify({"status": "error", "error": f"Room {room_id} not found"}), 404

            room_status = utilization_df.groupby('Room ID').agg({
                'Utilization': 'mean',
                'Room Type': 'first',
                'Status': lambda x: ', '.join(x.dropna().unique())
            }).reset_index()

            return jsonify({
                "status": "success",
                "room_status": room_status.to_dict(orient="records")[0],
                "daily_utilization": daily_summary_df.to_dict(orient='records'),
                "weekly_summary": weekly_summary_df.to_dict(orient='records'),
                "current_time_matches": current_time_df.to_dict(orient='records'),
            }), 200
        else:
            room_status = df.groupby('Room ID').agg({
                'Utilization': 'mean',
                'Room Type': 'first',
                'Status': lambda x: ', '.join(x.dropna().unique())
            }).reset_index()

            return jsonify({
                "status": "success",
                "room_status": room_status.to_dict(orient="records"),
                "daily_utilization": daily_summary.to_dict(orient='records'),
                "weekly_summary": weekly_summary.to_dict(orient='records'),
                "current_time_matches": current_time_df.to_dict(orient='records')
            }), 200

    except KeyError as e:
        return jsonify({'status': 'error', 'error': f'Key error: {e}'}), 500
    except Exception as e:
        return jsonify({'status': 'error', 'error': f'Unexpected error: {e}'}), 500


@routes_bp.route('/api/predict', methods=['POST'])
def predict_utilization():
    try:
        data = request.get_json()
        room_id = data.get('room_id')
        period = int(request.args.get('period', 7))
        
        if period < 1 or period > 30:
            return jsonify({"status": "error", "error": "Period must be between 1 and 30 days"}), 400

        # Fetch data from MongoDB
        query = {'Room ID': room_id} if room_id else {}
        raw_data = list(timetables_collection.find(query, {'_id': 0}))
        
        if not raw_data:
            return jsonify({"status": "error", "error": "No data found for the given filters"}), 404

        # Convert to DataFrame and preprocess
        df = pd.DataFrame(raw_data)
        if df.empty:
            return jsonify({"status": "error", "error": "No data found after processing"}), 404

        # Apply preprocessing (fixed syntax)
        df, _, _ = preprocess_data(df)

        # Group by Room ID
        predictions = []
        room_ids = [room_id] if room_id else df['Room ID'].unique()

        for rid in room_ids:
            room_df = df[df['Room ID'] == rid][['Room ID', 'Date', 'Utilization']].copy()
            
            # Rename columns for Prophet (fixed column mapping)
            room_df = room_df.rename(columns={'Date': 'ds', 'Utilization': 'y'})
            room_df['ds'] = pd.to_datetime(room_df['ds'])

            if room_df.empty:
                continue

            # Train Prophet model
            model = Prophet(yearly_seasonality=True, weekly_seasonality=True, daily_seasonality=False)
            model.fit(room_df)

            # Make future predictions
            future = model.make_future_dataframe(periods=period, freq='D')
            forecast = model.predict(future)

            # Extract predictions for future dates only
            forecast = forecast.tail(period)
            dates = forecast['ds'].dt.strftime('%Y-%m-%d').tolist()
            utilization = forecast['yhat'].clip(lower=0, upper=100).tolist()
            
            # Calculate trend
            trend = forecast['trend'].mean()
            trend_indicator = "Increasing" if trend > 0 else "Decreasing" if trend < 0 else "Stable"

            # Calculate average utilization
            avg_utilization = sum(utilization) / len(utilization)

            # Determine utilization status
            if avg_utilization > 80:
                utilization_status = "Over-Utilized"
                utilization_tip = "Consider splitting sessions or adding capacity to avoid scheduling conflicts."
            elif avg_utilization < 20:
                utilization_status = "Under-Utilized"
                utilization_tip = "Reallocate to smaller rooms or free up for alternative uses."
            else:
                utilization_status = "Optimal"
                utilization_tip = "Utilization is balanced; maintain existing schedule."

            # Generate demand levels and tips (fixed loop syntax)
            demand_levels = []
            optimization_tips = []
            for util in utilization:
                if util < 30:
                    demand_levels.append("Low")
                    optimization_tips.append("Consider reallocating to smaller rooms or freeing for maintenance.")
                elif util < 70:
                    demand_levels.append("Medium")
                    optimization_tips.append("Monitor usage; suitable for standard scheduling.")
                else:
                    demand_levels.append("High")
                    optimization_tips.append("Prioritize booking; consider adding capacity.")

            predictions.append({
                'room_id': rid,
                "dates": dates,
                "utilization": utilization,
                "demand_levels": demand_levels,
                "optimization_tips": optimization_tips,
                "trend": trend_indicator,
                "utilization_status": utilization_status,
                "utilization_tip": utilization_tip,
                "average_utilization": round(avg_utilization, 2)
            })

        return jsonify({
            "status": "success",
            "message": "Classroom demand predictions generated successfully",
            "predictions": predictions
        }), 200

    except KeyError as e:
        return jsonify({"status": "error", "error": f"Key error: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"status": "error", "error": f"An unexpected error occurred: {str(e)}"}), 500


@routes_bp.route('/api/current_utilization', methods=['POST'])
def current_utilization():
    try:
        data = request.get_json()
        room_id = data.get('room_id')
        
        # Get data from database
        query = {'Room ID': room_id} if room_id else {}
        raw_data = list(timetables_collection.find(query, {'_id': 0}))
        
        if not raw_data:
            return jsonify({"status": "error", "error": "No data found for the specified room"}), 404

        # Process data
        df = pd.DataFrame(raw_data)
        df, daily_summary, _ = preprocess_data(df)

        results = []
        room_ids = [room_id] if room_id else df['Room ID'].unique()
        
        for rid in room_ids:
            room_daily = daily_summary[daily_summary['Room ID'] == rid].copy()
            
            if room_daily.empty:
                continue

            # Calculate basic utilization metrics
            util_col = 'Daily_Utilization' if 'Daily_Utilization' in room_daily.columns else 'Daily Utilization'
            
            avg_utilization = room_daily[util_col].mean()
            peak_utilization = room_daily[util_col].max()
            min_utilization = room_daily[util_col].min()
            total_days_analyzed = len(room_daily)
            days_over_70_percent = len(room_daily[room_daily[util_col] > 70])
            days_under_30_percent = len(room_daily[room_daily[util_col] < 30])

            # Determine utilization status and tip
            if avg_utilization > 70:
                utilization_status = "Over-Utilized"
                utilization_tip = f"High demand ({days_over_70_percent}/{total_days_analyzed} days >70%); consider alternative rooms."
            elif avg_utilization < 30:
                utilization_status = "Under-Utilized"
                utilization_tip = f"Low usage ({days_under_30_percent}/{total_days_analyzed} days <30%); prioritize scheduling here."
            else:
                utilization_status = "Optimal"
                utilization_tip = f"Balanced usage across {total_days_analyzed} days; continue current strategy."

            # Daily analysis - get actual values for each date
            daily_analysis = []
            day_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
            timeslots = [f"{h:02d}:00-{h+1:02d}:00" for h in range(8, 20)]
            room_df = df[df['Room ID'] == rid]
            
            for day in day_order:
                day_data = room_daily[room_daily['Day'] == day]
                day_sessions = room_df[room_df['Day'] == day]
                
                if day_data.empty:
                    day_utilization = 0
                    day_status = "No Classes"
                    day_recommendation = "Available for scheduling"
                    free_slots = timeslots.copy()
                    courses = []
                    courses_scheduled = 0
                else:
                    # Get actual utilization values (not average)
                    day_utilization = day_data[util_col].iloc[0] if len(day_data) == 1 else day_data[util_col].mean()
                    
                    # Process courses for this day
                    courses = []
                    day_summary = day_data.iloc[0] if len(day_data) > 0 else None
                    if day_summary is not None and 'Courses' in day_summary:
                        courses_str = day_summary['Courses']
                        if pd.notna(courses_str):
                            courses.extend([c.strip() for c in courses_str.split(',') if c.strip()])
                    courses = list(set(courses))
                    courses_scheduled = len(courses)
                    
                    # Calculate booked slots from session data
                    booked_slots = set()
                    for _, session in day_sessions.iterrows():
                        try:
                            start = pd.to_datetime(session['Start'], format='%H:%M').time()
                            end = pd.to_datetime(session['End'], format='%H:%M').time()
                            
                            # Check which time slots are booked
                            for slot in timeslots:
                                slot_start = pd.to_datetime(slot.split('-')[0], format='%H:%M').time()
                                slot_end = pd.to_datetime(slot.split('-')[1], format='%H:%M').time()
                                
                                if start < slot_end and end > slot_start:
                                    booked_slots.add(slot)
                        except (ValueError, KeyError):
                            continue
                    
                    # Calculate free slots
                    free_slots = [slot for slot in timeslots if slot not in booked_slots]
                    
                    # Determine status
                    if day_utilization > 80:
                        day_status = "Heavily Utilized"
                        day_recommendation = f"Peak day at {day_utilization:.1f}%. Consider redistributing courses."
                    elif day_utilization > 50:
                        day_status = "Well Utilized"
                        day_recommendation = f"Good utilization at {day_utilization:.1f}%. {len(free_slots)} slots available."
                    elif day_utilization > 20:
                        day_status = "Moderately Utilized"
                        day_recommendation = f"Moderate usage at {day_utilization:.1f}%. {len(free_slots)} slots for additional classes."
                    else:
                        day_status = "Under Utilized"
                        day_recommendation = f"Low usage at {day_utilization:.1f}%. {len(free_slots)} slots available for scheduling."

                # Categorize slots for priority scheduling
                morning_slots = [slot for slot in free_slots if int(slot.split(':')[0]) < 12]
                afternoon_slots = [slot for slot in free_slots if 12 <= int(slot.split(':')[0]) < 17]
                
                priority_slots = morning_slots[:2] + afternoon_slots[:2]
                if not priority_slots:
                    priority_slots = free_slots[:3]

                daily_analysis.append({
                    'day': day,
                    'utilization_percentage': round(day_utilization, 2),
                    'status': day_status,
                    'recommendation': day_recommendation,
                    'free_timeslots': free_slots,
                    'free_slots_count': len(free_slots),
                    'courses_scheduled': courses_scheduled,
                    'priority_scheduling_slots': priority_slots
                })

            # Calculate daily distribution (similar to overall distribution)
            days_analysis_over_70 = len([day for day in daily_analysis if day['utilization_percentage'] > 70])
            days_analysis_under_30 = len([day for day in daily_analysis if day['utilization_percentage'] < 30])
            days_analysis_optimal = len(daily_analysis) - days_analysis_over_70 - days_analysis_under_30

            # Generate scheduling recommendations
            best_days = sorted(daily_analysis, key=lambda x: x['utilization_percentage'])[:2]
            worst_days = sorted(daily_analysis, key=lambda x: x['utilization_percentage'], reverse=True)[:2]
            
            scheduling_recommendations = {
                'immediate_opportunities': [f"{day['day']}: {day['free_slots_count']} free slots" for day in best_days if day['utilization_percentage'] < 40],
                'redistribution_needed': [f"{day['day']}: {day['utilization_percentage']:.1f}%" for day in worst_days if day['utilization_percentage'] > 75],
                'optimal_days_for_new_courses': [day['day'] for day in best_days if day['utilization_percentage'] < 40]
            }

            results.append({
                'room_id': rid,
                'utilization_metrics': {
                    'average_utilization': round(avg_utilization, 2),
                    'peak_utilization': round(peak_utilization, 2),
                    'minimum_utilization': round(min_utilization, 2)
                },
                'utilization_status': utilization_status,
                'utilization_tip': utilization_tip,
                'utilization_distribution': {
                    'days_over_70_percent': days_over_70_percent,
                    'days_under_30_percent': days_under_30_percent,
                    'days_optimal_range': total_days_analyzed - days_over_70_percent - days_under_30_percent
                },
                'daily_analysis': daily_analysis,
                'daily_analysis_distribution': {
                    'days_over_70_percent': days_analysis_over_70,
                    'days_under_30_percent': days_analysis_under_30,
                    'days_optimal_range': days_analysis_optimal
                },
                'scheduling_recommendations': scheduling_recommendations,
                'summary_insights': {
                    'best_day_for_scheduling': min(daily_analysis, key=lambda x: x['utilization_percentage'])['day'],
                    'busiest_day': max(daily_analysis, key=lambda x: x['utilization_percentage'])['day'],
                    'total_days_analyzed': total_days_analyzed,
                    'total_available_slots_per_week': sum(day['free_slots_count'] for day in daily_analysis)
                }
            })

        return jsonify({
            'status': 'success',
            'message': 'Utilization analysis completed',
            'total_rooms_analyzed': len(results),
            'results': results
        }), 200

    except Exception as e:
        return jsonify({'status': 'error', 'error': f'Error: {str(e)}'}), 500
    

@routes_bp.route('/get_room_schedules', methods=['GET'])
def get_room_schedules():
    try:
        room_id = request.args.get('room_id')
        day = request.args.get('day')
        
        # Pagination parameters
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 10))  # Default 10 items per page
        
        # Ensure valid pagination parameters
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 50:  # Limit max items per page
            per_page = 10
        
        if not room_id:
            return jsonify({'status': 'error', 'error': 'Missing required parameter: room_id'}), 400
        
        # Use day if provided, otherwise get all schedules
        query = {'Room ID': room_id}
        if day:
            query['Day'] = day
        
        # Get total count for pagination info
        total_count = db.timetables.count_documents(query)
        
        # Calculate skip value for pagination
        skip = (page - 1) * per_page
        
        # Get paginated schedules for this room and day
        schedules = list(db.timetables.find(query, {'_id': 0}).skip(skip).limit(per_page))
        
        # Format times consistently for display
        for schedule in schedules:
            start = schedule.get('Start', '')
            end = schedule.get('End', '')
            if start and end:
                schedule['Time'] = f"{start}–{end}"  # Using en dash for consistency
        
        # Calculate pagination metadata
        total_pages = (total_count + per_page - 1) // per_page  # Ceiling division
        has_next = page < total_pages
        has_prev = page > 1
        
        return jsonify({
            'status': 'success',
            'message': f'Found {total_count} schedules',
            'room_id': room_id,
            'day': day if day else 'All days',
            'schedules': schedules,
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
        return jsonify({'status': 'error', 'error': f'Unexpected error: {str(e)}'}), 500
    

@routes_bp.route('/refresh_aggregated_data', methods=['GET'])
def refresh_aggregated_data():
    try:
        room_id = request.args.get('room_id')
        prioritize_day = request.args.get('prioritize_day', 'true').lower() == 'true'
        
        # Build query based on parameters
        query = {}
        if room_id:
            query['Room ID'] = room_id
        
        # Fetch data from MongoDB
        raw_data = list(timetables_collection.find(query, {'_id': 0}))
        if not raw_data:
            return jsonify({"status": "error", "error": "No data found for the given filters"}), 404

        # Print raw data for debugging
        print(f"Raw data from database for room {room_id}:")
        for item in raw_data[:2]:  # Print just a couple of items to avoid log spam
            print(f"  {item}")

        # Convert to DataFrame and reprocess
        df = pd.DataFrame(raw_data)
        if df.empty:
            return jsonify({"status": "error", "error": "No data found after processing"}), 404

        # Apply preprocessing to regenerate aggregated data
        df, daily_summary, weekly_summary = preprocess_data(df)
        
        # If prioritizing day-based data, filter daily_summary to only include day-based entries
        if prioritize_day:
            # Check if we have day-based entries for this room
            if room_id:
                day_entries = daily_summary[(daily_summary['Room ID'] == room_id) & 
                                          (daily_summary['Date'] == pd.to_datetime('today').date())]
                
                if not day_entries.empty:
                    print(f"Using day-based entries for room {room_id}")
                    daily_summary = day_entries
        
        # Return the refreshed data
        if room_id:
            daily_summary_df = daily_summary[daily_summary['Room ID'] == room_id]
            weekly_summary_df = weekly_summary[weekly_summary['Room ID'] == room_id]
            
            return jsonify({
                "status": "success",
                "daily_utilization": daily_summary_df.to_dict(orient='records'),
                "weekly_summary": weekly_summary_df.to_dict(orient='records'),
                "message": "Aggregated data refreshed successfully"
            }), 200
        else:
            return jsonify({
                "status": "success",
                "daily_utilization": daily_summary.to_dict(orient='records'),
                "weekly_summary": weekly_summary.to_dict(orient='records'),
                "message": "All aggregated data refreshed successfully"
            }), 200
            
    except Exception as e:
        print(f"Error refreshing aggregated data: {str(e)}")
        return jsonify({'status': 'error', 'error': f'Unexpected error: {str(e)}'}), 500
    

@routes_bp.route('/get_day_based_schedules', methods=['GET'])
def get_day_based_schedules():
    try:
        room_id = request.args.get('room_id')
        
        # Pagination parameters
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 10))  # Default 10 items per page
        
        # Ensure valid pagination parameters
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 50:  # Limit max items per page
            per_page = 10
        
        if not room_id:
            return jsonify({'status': 'error', 'error': 'Missing required parameter: room_id'}), 400
        
        # Get all schedules for this room
        query = {'Room ID': room_id}
        schedules = list(timetables_collection.find(query, {'_id': 0}))
        
        if not schedules:
            return jsonify({'status': 'error', 'error': f'No schedules found for room {room_id}'}), 404
        
        # Process the data manually to group by day
        day_schedules = {}
        
        for schedule in schedules:
            day = schedule.get('Day', 'Unknown')
            course = schedule.get('Course', 'Unknown')
            start = schedule.get('Start', '')
            end = schedule.get('End', '')
            time_slot = f"{start}–{end}" if start and end else "Unknown"
            department = schedule.get('Department', 'Unknown')
            year = schedule.get('Year', 'Unknown')
            status = schedule.get('Status', 'Unknown')
            
            if day not in day_schedules:
                day_schedules[day] = {
                    'Room ID': room_id,
                    'Day': day,
                    'Courses': [],
                    'Time_Slot': [],
                    'Department': [],
                    'Year': [],
                    'Status': [],
                    'Daily_Utilization': 0,
                    'Daily_Booked_Hours': 0
                }
            
            # Add unique values only
            if course not in day_schedules[day]['Courses']:
                day_schedules[day]['Courses'].append(course)
            
            if time_slot not in day_schedules[day]['Time_Slot']:
                day_schedules[day]['Time_Slot'].append(time_slot)
            
            if department not in day_schedules[day]['Department']:
                day_schedules[day]['Department'].append(department)
                
            if str(year) not in [str(y) for y in day_schedules[day]['Year']]:
                day_schedules[day]['Year'].append(str(year))
                
            if status not in day_schedules[day]['Status']:
                day_schedules[day]['Status'].append(status)
            
            # Calculate booked hours if possible
            try:
                if start and end:
                    # Parse times
                    start_parts = start.split(':')
                    end_parts = end.split(':')
                    
                    if len(start_parts) == 2 and len(end_parts) == 2:
                        start_hour = int(start_parts[0])
                        start_min = int(start_parts[1])
                        end_hour = int(end_parts[0])
                        end_min = int(end_parts[1])
                        
                        # Calculate hours
                        hours = (end_hour - start_hour) + (end_min - start_min) / 60
                        if hours > 0:
                            day_schedules[day]['Daily_Booked_Hours'] += hours
            except Exception as e:
                print(f"Error calculating hours: {e}")
        
        # Format the data for response
        result = []
        for day, data in day_schedules.items():
            # Calculate utilization percentage
            data['Daily_Utilization'] = (data['Daily_Booked_Hours'] / 12) * 100
            
            # Join lists into comma-separated strings
            data['Courses'] = ', '.join(data['Courses'])
            data['Time_Slot'] = ', '.join(data['Time_Slot'])
            data['Department'] = ', '.join(data['Department'])
            data['Year'] = ', '.join(data['Year'])
            data['Status'] = ', '.join(data['Status'])
            
            result.append(data)
        
        # Apply pagination
        total_count = len(result)
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        paginated_result = result[start_idx:end_idx]
        
        # Calculate pagination metadata
        total_pages = (total_count + per_page - 1) // per_page if total_count > 0 else 1  # Ceiling division
        has_next = page < total_pages
        has_prev = page > 1
        
        return jsonify({
            'status': 'success',
            'message': 'Day-based schedules retrieved successfully',
            'daily_utilization': paginated_result,
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
        print(f"Error getting day-based schedules: {str(e)}")
        return jsonify({'status': 'error', 'error': f'Unexpected error: {str(e)}'}), 500
    





    