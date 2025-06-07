import pandas as pd
from datetime import datetime

total_availableHrs = 12

def preprocess_data(df):
    # Convert Date to proper format
    df['Date'] = pd.to_datetime(df['Date'])
    
    df = df.drop_duplicates(subset=['Room ID', 'Date', 'Start', 'End'])

    df['Start_dt'] = pd.to_datetime(df['Date'].dt.strftime('%Y-%m-%d') + ' ' + df['Start'], errors='coerce')
    df['End_dt'] = pd.to_datetime(df['Date'].dt.strftime('%Y-%m-%d') + ' ' + df['End'], errors='coerce')

    # Booked hours per session
    df['Booked hours']= (df['End_dt']- df['Start_dt']).dt.total_seconds() / 3600
    # Individual session utilization
    df['Utilization']= (df['Booked hours']/ total_availableHrs)*100

    # Daily totals per Room ID
    df['Date_only'] = pd.to_datetime(df['Date']).dt.date
    df['TimeSlot'] = df.apply(
        lambda x: f"{x['Start']}–{x['End']}", axis=1
    )
    df['TimeSlot']= df['TimeSlot'].sort_values()
    print(f'adjusted time format \n {df["Start_dt"]}')
 
    daily_summary = df.groupby(['Room ID', 'Date_only']).agg(
        Daily_Booked_Hours=('Booked hours', 'sum'),
        Daily_Utilization=('Booked hours', lambda x: (x.sum() / total_availableHrs) * 100),
        Courses=('Course', lambda x: ', '.join(x.dropna().unique())),
        Day=('Day', 'first'),
        Time_Slot=('TimeSlot', lambda x: ', '.join(x.dropna())),
        Department=('Department', lambda x: ', '.join(x.dropna().unique())),
        Status=('Status', lambda x: ', '.join(x.dropna().unique())),
        Year=('Year', lambda x: ', '.join(x.dropna().astype(str)))
    ).reset_index()
    daily_summary = daily_summary.rename(columns={'Date_only' : 'Date'})

    # Weekly totals per Room ID
    df['Week'] = df['Date'].dt.to_period('W').apply(lambda r: r.start_time)
    weekly_summary = df.groupby(['Room ID', 'Week']).agg(
        Weekly_Booked_Hours=('Booked hours', 'sum'),
        Weekly_Utilization=('Booked hours', lambda x: (x.sum() / (total_availableHrs * 5)) * 100),
        Day=('Day', 'first')
    ).reset_index()

    return df, daily_summary, weekly_summary