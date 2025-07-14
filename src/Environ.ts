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

export interface Prediction {
  room_id: string;
  dates: string[];
  utilization: number[];
  demand_levels: string[];
  optimization_tips: string[];
  trend: string;
  utilization_status: string;
  utilization_tip: string;
  average_utilization: number;
}





export interface DailyAnalysis {
  day: string;
  utilization_percentage: number;
  booked_hours: number;
  status: string;
  courses_scheduled: string[];
  total_courses: number;
  free_timeslots: string[];
  free_slots_count: number;
  priority_scheduling_slots: string[];
  session_details: any;
  Totalrooms:number
}

export interface SchedulingRecommendations {
  immediate_opportunities: string[];
  redistribution_needed: string[];
  weekly_strategy: string[];
  optimal_days_for_new_courses: string[];
}

export interface UtilizationMetrics {
  average_utilization: number;
  peak_utilization: number;
  minimum_utilization: number;
  utilization_trend: string;
}

export interface UtilizationDistribution {
  days_over_70_percent: number;
  days_under_30_percent: number;
  days_optimal_range: number;
}

export interface SummaryInsights {
  best_day_for_scheduling: string;
  busiest_day: string;
  total_available_slots_per_week: number;
  average_courses_per_day: number;
}

export interface AnalysisResult {
  room_id: string;
  analysis_period_days: number;
  utilization_metrics: UtilizationMetrics;
  utilization_status: string;
  utilization_tip: string;
  utilization_distribution: UtilizationDistribution;
  daily_analysis: DailyAnalysis[];
  scheduling_recommendations: SchedulingRecommendations;
  summary_insights: SummaryInsights;
}






export interface SmartAvailabilityRequest {
  operation: 'smart_availability';
  date?: string; // YYYY-MM-DD, optional (defaults to current date)
  start_time?: string; // HH:MM, optional
  end_time?: string; // HH:MM, optional
  department?: string; // Optional department filter
}

export interface OptimizeResourcesRequest {
  operation: 'optimize_resources';
}

export interface RoomInfo {
  room_id: string;
  department: string;
  utilization: number;
  score?: number; // Only in smart_availability
  status?: 'Over-utilized' | 'Under-utilized' | 'Well-utilized'; // Only in optimize_resources
}

export interface SmartAvailabilityResponse {
  message: string;
  date: string;
  day: string;
  time_slot: string;
  total_available: number;
  recommended_rooms: RoomInfo[];
}

export interface OptimizeResourcesResponse {
  message: string;
  total_rooms: number;
  over_utilized_rooms: number;
  under_utilized_rooms: number;
  room_analysis: RoomInfo[];
  recommendations: {
    redistribute_from: string[];
    redistribute_to: string[];
  };
}

export interface ErrorResponse {
  error: string;
}


// Base response interface
export interface ApiResponse<T = any> {
  message?: string;
  error?: string;
  [key: string]: any;
}

// Check Overlap Operation Response
export interface CheckOverlapResponse extends ApiResponse {
  room_id: string;
  date: string;
  proposed_time: string;
  has_conflict: boolean;
  conflicts: ConflictInfo[];
}

export interface ConflictInfo {
  schedule_id: string;
  course: string;
  time: string;
}

// Reallocate Operation Response
export interface ReallocateResponse extends ApiResponse {
  schedule_id: string;
  new_schedule: NewSchedule;
}

// Inject Schedule Operation Response
export interface InjectScheduleResponse extends ApiResponse {
  schedule_id: string;
  schedule: ScheduleDocument;
  refreshed_data?: {
    daily_utilization: DailyUtilization[];
    weekly_summary: WeeklyUtilization[];
  };
}

// Suggest Rooms Operation Response
export interface SuggestRoomsResponse extends ApiResponse {
  date: string;
  day: string;
  time: string;
  suggested_rooms: SuggestedRoom[];
}

export interface SuggestedRoom {
  room_id: string;
  department?: string;
  status: string;
  free_slots: FreeTimeSlot[];
  requested_slot?: RequestedTimeSlot;
}

export interface FreeTimeSlot {
  start: string;
  end: string;
  duration: string;
}

export interface RequestedTimeSlot {
  start: string;
  end: string;
  duration: string;
}

// Request payload interfaces
export interface ManageResourcesRequest {
  operation: 'check_overlap' | 'reallocate' | 'inject_schedule' | 'suggest_rooms';
  room_id?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  day?: string;
  schedule_id?: string;
  new_schedule?: NewSchedule;
  department?: string;
  course?: string;
  lecturer?: string;
  level?: string;
  program?: string;
}

export interface NewSchedule {
  room_id: string;
  date?: string;
  start_time: string;
  end_time: string;
  day: string;
  course?: string;
  department?: string;
  year?: string;
  status?: string;
  lecturer?: string;
}

export interface ScheduleDocument {
  'Room ID': string;
  Date: string;
  Start: string;
  End: string;
  Day: string;
  Course: string;
  Department: string;
  Lecturer: string;
  Level: string;
  Program: string;
}