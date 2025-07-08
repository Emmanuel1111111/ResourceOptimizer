import pandas as pd
from datetime import datetime

total_availableHrs = 12



def preprocess_data(df):
    
    # Print input data for debugging
    print(f"Input data sample:\n{df.head()}")
    print(f"Input columns: {df.columns.tolist()}")
    
    # Make sure we have the required columns
    required_columns = ['Room ID', 'Date', 'Start', 'End', 'Course', 'Day']
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        print(f"Warning: Missing required columns: {missing_columns}")
        # Add missing columns with default values
        for col in missing_columns:
            df[col] = 'Unknown'
    
    # Convert Date to datetime
    df['Date'] = pd.to_datetime(df['Date'])
    
    df = df.drop_duplicates(subset=['Room ID', 'Date', 'Start', 'End', 'Course'])

    # Handle potential format issues with Start and End times
    df['Start'] = df['Start'].astype(str)
    df['End'] = df['End'].astype(str)
    
    # Convert to datetime for calculations
    try:
        df['Start_dt'] = pd.to_datetime(df['Date'].dt.strftime('%Y-%m-%d') + ' ' + df['Start'], errors='coerce')
        df['End_dt'] = pd.to_datetime(df['Date'].dt.strftime('%Y-%m-%d') + ' ' + df['End'], errors='coerce')
    except Exception as e:
        print(f"Error converting dates: {e}")
        # Fallback approach
        df['Start_dt'] = pd.to_datetime(df['Date'])
        df['End_dt'] = pd.to_datetime(df['Date'])
    
    # Calculate booked hours and utilization
    df['Booked hours'] = (df['End_dt'] - df['Start_dt']).dt.total_seconds() / 3600
    df['Utilization'] = (df['Booked hours'] / total_availableHrs) * 100

    # Create TimeSlot field with en dash
    df['TimeSlot'] = df.apply(lambda x: f"{x['Start']}–{x['End']}", axis=1)
    
    # Create Date_only field for date-based grouping
    df['Date_only'] = pd.to_datetime(df['Date']).dt.date
    
    # Create two different aggregations: one by Date and one by Day
    
    # 1. Date-based aggregation (original approach)
    date_summary = df.groupby(['Room ID', 'Date_only']).agg(
        Daily_Booked_Hours=('Booked hours', 'sum'),
        Daily_Utilization=('Booked hours', lambda x: (x.sum() / total_availableHrs) * 100),
        Courses=('Course', lambda x: ', '.join(x.dropna().unique())),
        Day=('Day', 'first'),
        Time_Slot=('TimeSlot', lambda x: ', '.join(x.dropna())),
        Department=('Department', lambda x: ', '.join(x.dropna().unique())),
        Status=('Status', lambda x: ', '.join(x.dropna().unique())),
        Year=('Year', lambda x: ', '.join(x.dropna().astype(str))),
        Totalrooms=('Room ID', 'count')
    ).reset_index()
    
    date_summary = date_summary.rename(columns={'Date_only': 'Date'})
    
    # 2. Day-based aggregation (new approach)
    day_summary = df.groupby(['Room ID', 'Day']).agg(
        Daily_Booked_Hours=('Booked hours', 'sum'),
        Daily_Utilization=('Booked hours', lambda x: (x.sum() / total_availableHrs) * 100),
        Courses=('Course', lambda x: ', '.join(x.dropna().unique())),
        Time_Slot=('TimeSlot', lambda x: ', '.join(x.dropna())),
        Department=('Department', lambda x: ', '.join(x.dropna().unique())),
        Status=('Status', lambda x: ', '.join(x.dropna().unique())),
        Year=('Year', lambda x: ', '.join(x.dropna().astype(str))),
        Totalrooms=('Room ID', 'count')
    ).reset_index()
    
    # Add Date column for compatibility
    day_summary['Date'] = pd.to_datetime('today').date()
    
    # Merge the two summaries - use day_summary as the primary one
    # This ensures that day-based data takes precedence
    daily_summary = pd.concat([day_summary], ignore_index=True)
    
    # Weekly summary calculation
    df['Week'] = df['Date'].dt.to_period('W').apply(lambda r: r.start_time)
    weekly_summary = df.groupby(['Room ID', 'Week']).agg(
        Weekly_Booked_Hours=('Booked hours', 'sum'),
        Weekly_Utilization=('Booked hours', lambda x: (x.sum() / (total_availableHrs * 5)) * 100),
        Day=('Day', 'first')
    ).reset_index()
    
    print(f'Daily summary (combined):\n{daily_summary.head(5)}')
    print(f'Weekly summary:\n{weekly_summary.head(5)}')

    return df, daily_summary, weekly_summary 
     