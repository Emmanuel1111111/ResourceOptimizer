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
        # identity = get_jwt_identity()
        print("User identity from JWT:")

        # Fetch data from MongoDB
        query = {}
        if room_id:
            query['Room ID'] = room_id
        raw_data = list(timetables_collection.find(query, {'_id': 0}))
        if not raw_data:
            return jsonify({"error": "No data found for the given filters"}), 404

        # Convert to DataFrame
        df = pd.DataFrame(raw_data)
        if df.empty:
            return jsonify({"error": "No data found after processing"}), 404

        # Apply preprocessing
        df, daily_summary, weekly_summary = preprocess_data(df)
        df = df.dropna(subset=['Start', 'End'])

        # Time-based filtering
        now_time = datetime.now().time()
        now_day = datetime.now().strftime('%A')  # e.g., 'Monday', 'Tuesday', etc.
        buffer = timedelta(minutes=10)

        df['Start_dt'] = pd.to_datetime(df['Start'], format='%H:%M', errors='coerce').dt.time
        df['End_dt'] = pd.to_datetime(df['End'], format='%H:%M', errors='coerce').dt.time

        def is_within_time_and_day(start, end, day, current_time, current_day):
            try:
                start_buffer = (datetime.combine(datetime.today(), start) - buffer).time()
                end_buffer = (datetime.combine(datetime.today(), end) + buffer).time()
                # Check both day and time
                return (day == current_day) and (start_buffer <= current_time <= end_buffer)
            except Exception:
                return False

        df['Matches_Current_Time'] = df.apply(
            lambda row: is_within_time_and_day(
                row['Start_dt'], row['End_dt'], row['Day'], now_time, now_day
            ),
            axis=1
        )

        current_time_df = df[df['Matches_Current_Time'] == True][
            ['Room ID', 'Course', 'Start', 'End', 'Day', 'Status', 'Year', 'Department']
        ]

        if room_id:
            utilization_df = df[df['Room ID'] == room_id]
            daily_summary_df = daily_summary[daily_summary['Room ID'] == room_id]
            weekly_summary_df = weekly_summary[weekly_summary['Room ID'] == room_id]
            current_time_df = current_time_df[current_time_df['Room ID'] == room_id]

            if utilization_df.empty:
                return jsonify({"error": f"Room {room_id} not found"}), 404

            room_status = utilization_df.groupby('Room ID').agg({
                'Utilization': 'mean',
                'Room Type': 'first',
                'Status': lambda x: ', '.join(x.dropna().unique())
            }).reset_index()

            return jsonify({
                "room_status": room_status.to_dict(orient="records")[0],
                "daily_utilization": daily_summary_df.to_dict(orient='records'),
                "weekly_summary": weekly_summary_df.to_dict(orient='records'),
                "current_time_matches": current_time_df.to_dict(orient='records'),
            })
        else:
            room_status = df.groupby('Room ID').agg({
                'Utilization': 'mean',
                'Room Type': 'first',
                'Status': lambda x: ', '.join(x.dropna().unique())
            }).reset_index()

            return jsonify({
                "room_status": room_status.to_dict(orient="records"),
                "daily_utilization": daily_summary.to_dict(orient='records'),
                "weekly_summary": weekly_summary.to_dict(orient='records'),
                "current_time_matches": current_time_df.to_dict(orient='records')
            })

    except KeyError as e:
        return jsonify({'error': f'Key error: {e}'}), 500
    except Exception as e:
        return jsonify({'error': f'Unexpected error: {e}'}), 500


@routes_bp.route('/api/predict', methods=['POST'])
def predict_utilization():
    try:
        data = request.get_json()
        room_id = data.get('room_id')
        period = int(request.args.get('period', 7))
        
        if period < 1 or period > 30:
            return jsonify({"error": "Period must be between 1 and 30 days"}), 400

        # Fetch data from MongoDB
        query = {'Room ID': room_id} if room_id else {}
        raw_data = list(timetables_collection.find(query, {'_id': 0}))
        
        if not raw_data:
            return jsonify({"error": "No data found for the given filters"}), 404

        # Convert to DataFrame and preprocess
        df = pd.DataFrame(raw_data)
        if df.empty:
            return jsonify({"error": "No data found after processing"}), 404

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
            "message": "Classroom demand predictions generated successfully",
            "predictions": predictions
        })

    except KeyError as e:
        return jsonify({"error": f"Key error: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500


@routes_bp.route('/api/current_utilization', methods=['POST'])
def current_utilization():
    try:
        data = request.get_json()
        room_id = data.get('room_id')
        days = int(request.args.get('days', 7))
        
        if days < 1 or days > 300:
            return jsonify({'error': "Days must be between 1 and 300"}), 400

        # Fetch recent data
        cutoff = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')
        query = {'Room ID': room_id, 'Date': {'$gte': cutoff}} if room_id else {'Date': {'$gte': cutoff}}
        raw_data = list(timetables_collection.find(query, {'_id': 0}))
        
        if not raw_data:
            return jsonify({"error": "No data found for the given filters"}), 404

        # Convert to DataFrame and preprocess
        df = pd.DataFrame(raw_data)
        if df.empty:
            return jsonify({"error": "No data found after processing"}), 404

        df, daily_summary, _ = preprocess_data(df)

        # Generate timeslots
        timeslots = [f"{h:02d}:00-{h+1:02d}:00" for h in range(8, 20)]
        
        # Define day order for consistent display
        day_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

        results = []
        room_ids = [room_id] if room_id else df['Room ID'].unique()
        
        for rid in room_ids:
            room_df = df[df['Room ID'] == rid]
            if room_df.empty:
                continue

            # Get daily summary for this room
            room_daily = daily_summary[daily_summary['Room ID'] == rid].copy()
            
            if room_daily.empty:
                avg_utilization = 0
                total_days_analyzed = 0
                peak_utilization = 0
                min_utilization = 0
                days_over_70_percent = 0
                days_under_30_percent = 0
            else:
                # Calculate comprehensive utilization metrics
                avg_utilization = room_daily['Daily_Utilization'].mean()
                peak_utilization = room_daily['Daily_Utilization'].max()
                min_utilization = room_daily['Daily_Utilization'].min()
                total_days_analyzed = len(room_daily)
                days_over_70_percent = len(room_daily[room_daily['Daily_Utilization'] > 70])
                days_under_30_percent = len(room_daily[room_daily['Daily_Utilization'] < 30])
                
            # Handle NaN values
            if pd.isna(avg_utilization):
                avg_utilization = 0
            if pd.isna(peak_utilization):
                peak_utilization = 0
            if pd.isna(min_utilization):
                min_utilization = 0

            # Determine overall utilization status
            if avg_utilization > 70:
                utilization_status = "Over-Utilized"
                utilization_tip = f"High demand ({days_over_70_percent}/{total_days_analyzed} days >70%); consider scheduling classes in alternative rooms or splitting sessions."
            elif avg_utilization < 30:
                utilization_status = "Under-Utilized"
                utilization_tip = f"Low usage ({days_under_30_percent}/{total_days_analyzed} days <30%); prioritize scheduling classes in available timeslots to optimize."
            else:
                utilization_status = "Optimal"
                utilization_tip = f"Balanced usage across {total_days_analyzed} days analyzed; continue current scheduling strategy."

            # Generate detailed daily analysis with recommendations
            daily_analysis = []
            weekly_recommendations = []
            
            for day in day_order:
                # Get all sessions for this day across the time period
                day_sessions = room_df[room_df['Day'] == day]
                
                # Get daily utilization summary for this day
                day_summary = room_daily[room_daily['Day'] == day]
                
                if day_summary.empty:
                    day_utilization = 0
                    booked_hours = 0
                    courses = []
                else:
                    day_utilization = day_summary['Daily_Utilization'].mean()
                    booked_hours = day_summary['Daily_Booked_Hours'].mean()
                    courses = []
                    for courses_str in day_summary['Courses'].dropna():
                        courses.extend([c.strip() for c in courses_str.split(',') if c.strip()])
                    courses = list(set(courses))  # Remove duplicates
                
                # Calculate free timeslots for this day
                booked_slots = set()
                session_details = []
                
                for _, session in day_sessions.iterrows():
                    try:
                        start = pd.to_datetime(session['Start'], format='%H:%M').time()
                        end = pd.to_datetime(session['End'], format='%H:%M').time()
                        
                        session_details.append({
                            'course': session.get('Course', 'Unknown'),
                            'time': f"{session['Start']}-{session['End']}",
                            'department': session.get('Department', 'Unknown')
                        })
                        
                        # Find which timeslots are occupied
                        for slot in timeslots:
                            slot_start = pd.to_datetime(slot.split('-')[0], format='%H:%M').time()
                            slot_end = pd.to_datetime(slot.split('-')[1], format='%H:%M').time()
                            
                            if start < slot_end and end > slot_start:
                                booked_slots.add(slot)
                    except (ValueError, KeyError):
                        continue
                
                free_slots = [slot for slot in timeslots if slot not in booked_slots]
                
                # Generate day-specific recommendations
                day_status = ""
                day_recommendation = ""
                
                if day_utilization > 80:
                    day_status = "Heavily Utilized"
                    day_recommendation = f"Peak day with {day_utilization:.1f}% utilization. Consider redistributing {len(courses)} courses to other days or rooms."
                elif day_utilization > 50:
                    day_status = "Well Utilized"
                    day_recommendation = f"Good utilization at {day_utilization:.1f}%. {len(free_slots)} slots still available for additional scheduling."
                elif day_utilization > 20:
                    day_status = "Moderately Utilized"
                    day_recommendation = f"Moderate usage at {day_utilization:.1f}%. Excellent opportunity to schedule {len(free_slots)} additional classes."
                else:
                    day_status = "Under Utilized"
                    day_recommendation = f"Low usage at {day_utilization:.1f}%. Priority day for new class scheduling with {len(free_slots)} available slots."
                
                # Suggest specific time slots for scheduling
                priority_slots = []
                if len(free_slots) > 0:
                    # Prioritize morning and afternoon slots
                    morning_slots = [slot for slot in free_slots if slot.startswith(('08:', '09:', '10:', '11:'))]
                    afternoon_slots = [slot for slot in free_slots if slot.startswith(('14:', '15:', '16:', '17:'))]
                    
                    priority_slots = morning_slots[:2] + afternoon_slots[:2]  # Top 2 from each period
                    if not priority_slots:
                        priority_slots = free_slots[:3]  # Fallback to first 3 available
                
                daily_analysis.append({
                    'day': day,
                    'utilization_percentage': round(day_utilization, 2),
                    'booked_hours': round(booked_hours, 2),
                    'status': day_status,
                    'courses_scheduled': courses,
                    'total_courses': len(courses),
                    'free_timeslots': free_slots,
                    'free_slots_count': len(free_slots),
                    'priority_scheduling_slots': priority_slots,
                    'session_details': session_details,
                    'recommendation': day_recommendation
                })
                
                # Collect weekly recommendations
                if day_utilization < 30 and len(priority_slots) > 0:
                    weekly_recommendations.append(f"{day}: Schedule in {', '.join(priority_slots[:2])}")

            # Generate overall scheduling recommendations
            best_days = sorted(daily_analysis, key=lambda x: x['utilization_percentage'])[:2]
            worst_days = sorted(daily_analysis, key=lambda x: x['utilization_percentage'], reverse=True)[:2]
            
            scheduling_recommendations = {
                'immediate_opportunities': [
                    f"{day['day']}: {', '.join(day['priority_scheduling_slots'][:2])}" 
                    for day in best_days if day['free_slots_count'] > 3
                ],
                'redistribution_needed': [
                    f"{day['day']}: {day['utilization_percentage']:.1f}% utilized - consider moving courses to less busy days"
                    for day in worst_days if day['utilization_percentage'] > 75
                ],
                'weekly_strategy': weekly_recommendations[:5],  # Limit to top 5 recommendations
                'optimal_days_for_new_courses': [
                    day['day'] for day in best_days if day['utilization_percentage'] < 40
                ]
            }

            # Calculate utilization trend (if we have enough data)
            utilization_trend = "stable"
            if len(room_daily) >= 7:  # At least a week of data
                recent_days = room_daily.tail(3)['Daily_Utilization'].mean()
                earlier_days = room_daily.head(3)['Daily_Utilization'].mean()
                
                if recent_days > earlier_days + 10:
                    utilization_trend = "increasing"
                elif recent_days < earlier_days - 10:
                    utilization_trend = "decreasing"

            results.append({
                'room_id': rid,
                'analysis_period_days': total_days_analyzed,
                'utilization_metrics': {
                    'average_utilization': round(avg_utilization, 2),
                    'peak_utilization': round(peak_utilization, 2),
                    'minimum_utilization': round(min_utilization, 2),
                    'utilization_trend': utilization_trend
                },
                'utilization_status': utilization_status,
                'utilization_tip': utilization_tip,
                'utilization_distribution': {
                    'days_over_70_percent': days_over_70_percent,
                    'days_under_30_percent': days_under_30_percent,
                    'days_optimal_range': total_days_analyzed - days_over_70_percent - days_under_30_percent
                },
                'daily_analysis': daily_analysis,
                'scheduling_recommendations': scheduling_recommendations,
                'summary_insights': {
                    'best_day_for_scheduling': min(daily_analysis, key=lambda x: x['utilization_percentage'])['day'],
                    'busiest_day': max(daily_analysis, key=lambda x: x['utilization_percentage'])['day'],
                    'total_available_slots_per_week': sum(day['free_slots_count'] for day in daily_analysis),
                    'average_courses_per_day': round(sum(day['total_courses'] for day in daily_analysis) / len(daily_analysis), 1)
                }
            })

        return jsonify({
            'message': 'Enhanced utilization analysis completed',
            'analysis_period': f'{days} days',
            'total_rooms_analyzed': len(results),
            'results': results
        })

    except KeyError as e:
        return jsonify({'error': f'Key error: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'error': f'Unexpected error: {str(e)}'}), 500
     