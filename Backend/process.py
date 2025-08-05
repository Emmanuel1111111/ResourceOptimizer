import pandas as pd
from datetime import datetime

total_availableHrs = 12

def preprocess_data(df):
    
    
    # Make sure we have the required columns
    required_columns = ['Room ID', 'Date', 'Start', 'End', 'Course', 'Day']
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        print(f"Warning: Missing required columns: {missing_columns}")
   
        for col in missing_columns:
            df[col] = 'Unknown'
    
    # Convert Date to datetime
    df['Date'] = pd.to_datetime(df['Date'])
    
    # Detect and handle duplicates properly
    duplicate_mask = df.duplicated(subset=['Room ID', 'Day', 'Start', 'End', 'Course'], keep=False)
    if duplicate_mask.any():
       # print(f"Warning: {duplicate_mask.sum()} Duplicates found")
        duplicate_schedules = df[duplicate_mask][['Room ID', 'Date', 'Start', 'End', 'Course', 'Day']]
       # print("Duplicate schedules detected:")
       # print(duplicate_schedules.to_string(index=False))
        
      
        original_count = len(df)
        df = df.drop_duplicates(subset=['Room ID', 'Day', 'Start', 'End', 'Course'], keep='first').copy()
        removed_count = original_count - len(df)
       # print(f"Removed {removed_count} duplicate entries. Dataset now contains {len(df)} unique schedules.")
    else:
        # Create a copy to avoid SettingWithCopyWarning even when no duplicates
        df = df.copy()
    
    # Handle potential format issues with Start and End times
    df['Start'] = df['Start'].astype(str)
    df['End'] = df['End'].astype(str)

    try:
        df['Start_dt'] = pd.to_datetime(df['Date'].dt.strftime('%Y-%m-%d') + ' ' + df['Start'], errors='coerce')
        df['End_dt'] = pd.to_datetime(df['Date'].dt.strftime('%Y-%m-%d') + ' ' + df['End'], errors='coerce')
    except Exception as e:
        print(f"Error converting dates: {e}")
        df['Start_dt'] = pd.to_datetime(df['Date'])
        df['End_dt'] = pd.to_datetime(df['Date'])
    
    # Calculate booked hours and utilization
    df['Booked hours'] = (df['End_dt'] - df['Start_dt']).dt.total_seconds() / 3600
    df['Utilization'] = (df['Booked hours'] / total_availableHrs) * 100

    # Create TimeSlot field with en dash
    df['TimeSlot'] = df.apply(lambda x: f"{x['Start']}–{x['End']}", axis=1)
    
    # Create Date_only field for date-based grouping
    df['Date_only'] = pd.to_datetime(df['Date']).dt.date
    
    # Validate calculated hours to ensure no duplicates affected calculations
    max_daily_hours = df.groupby(['Room ID', 'Day'])['Booked hours'].sum().max()
    if max_daily_hours > total_availableHrs:
        print(f"WARNING: Maximum daily booked hours ({max_daily_hours:.2f}) exceeds available hours ({total_availableHrs})")
        print("This may indicate remaining data issues or overlapping schedules.")
    
    # 2. Day-based aggregation (new approach)
    day_summary = df.groupby(['Room ID', 'Day']).agg(
        Daily_Booked_Hours=('Booked hours', 'sum'),
        Daily_Utilization=('Booked hours', lambda x: (x.sum() / total_availableHrs) * 100),
        Courses=('Course', lambda x: ', '.join(x.dropna().unique())),
        Time_Slot=('TimeSlot', lambda x: ', '.join(x.dropna().unique())),  # Fixed: Added .unique()
        Department=('Department', lambda x: ', '.join(x.dropna().unique())),
        Status=('Status', lambda x: ', '.join(x.dropna().unique())),
        Year=('Year', lambda x: ', '.join(x.dropna().unique().astype(str))),  # Fixed: Added .unique()
        Totalrooms=('Room ID', 'count')
    ).reset_index()
    
    # Add Date column for compatibility
    day_summary['Date'] = pd.to_datetime('today').date()
    
    # Validate aggregation results
    
    daily_summary = pd.concat([day_summary], ignore_index=True)
    
    # Weekly summary calculation
    df['Week'] = df['Date'].dt.to_period('W').apply(lambda r: r.start_time)
    weekly_summary = df.groupby(['Room ID', 'Week']).agg(
        Weekly_Booked_Hours=('Booked hours', 'sum'),
        Weekly_Utilization=('Booked hours', lambda x: (x.sum() / (total_availableHrs * 5)) * 100),
        Day=('Day', 'first')
    ).reset_index()

    return df, daily_summary, weekly_summary 
     