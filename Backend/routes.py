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

        if not room_id:
            return jsonify({"error": "room_id is required"}), 400

        # Fetch data from MongoDB
        raw_data = list(timetables_collection.find({'Room ID': room_id}, {'_id': 0}))
        if not raw_data:
            return jsonify({"error": f"Room {room_id} not found"}), 404

        # Convert to DataFrame and preprocess
        df = pd.DataFrame(raw_data)
        df, _, _ = preprocess_data(df)

        # Prepare data for Prophet
        prophet_df = df[['Date', 'Utilization']].rename(columns={'Date': 'ds', 'Utilization': 'y'})
        prophet_df['ds'] = pd.to_datetime(prophet_df['ds'])

        # Train Prophet model
        model = Prophet(yearly_seasonality=True, weekly_seasonality=True, daily_seasonality=False)
        model.fit(prophet_df)

        # Make future predictions (next 7 days)
        future = model.make_future_dataframe(periods=7, freq='D')
        forecast = model.predict(future)

        # Extract predicted dates and utilization
        forecast = forecast.tail(7)
        dates = forecast['ds'].dt.strftime('%Y-%m-%d').tolist()
        utilization = forecast['yhat'].clip(lower=0, upper=100).tolist()

        return jsonify({
            "dates": dates,
            "utilization": utilization
        })

    except KeyError as e:
        return jsonify({"error": f"An error occurred: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500