
export interface Room {
  'Room ID': string;
  'Room Type': string;
  'Status': string;
  'Utilization': number;
}



export interface DailyUtilization {
  'Room ID': string;
  'Date': string;  
  'Daily_Booked_Hours': number;
  'Daily_Utilization': number;
  'Courses': string;
  'Day': string;
  'Time_Slot': string;
  'Department': string;
  'Status': string;
}

export interface LoginResponse {
  message: string;
  Id: string;
  token?: string;
  password?: string;
  username?: string;

}

export interface SignupResponse {
  Id: string;
  message: string;
  token?: string;
  username?: string;
  email?: string;
  password?: string;
}



export interface PredictionResponse {
  'Room ID': string;
  'Date': string;
  'Predicted_Utilization': number;
  'Predicted_Booked_Hours': number;
  'Confidence_Score': number;
}

export interface WeeklyUtilization {
  'Room ID': string;
  'Week': string;  
  'Weekly_Booked_Hours': number;
  'Weekly_Utilization': number;
}

export interface RoomAvailabilityRespone{
  room_status: Room;
  daily_utilization: DailyUtilization[];
  weekly_summary: WeeklyUtilization[];
  current_time_matches: CurrentSchedule[];
  Userinfo: UserInfo
}

export interface CurrentSchedule {
  'Room ID': string;
  'Day': string;
  'Course': string;
  'Status': string;
  'Start': string;
  'End': string;
  'Department': string;
  'Year': string;
}

export interface UserInfo{
  Id: string;
  username: string;
  email: string;
  token:string
  message:string
  
}