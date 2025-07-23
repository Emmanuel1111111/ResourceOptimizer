import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import {
  ManageResourcesRequest,
  CheckOverlapResponse,
  ReallocateResponse,
  InjectScheduleResponse,
  SuggestRoomsResponse,
  ApiResponse
} from '../Environ';
import { api } from '../api.config';

@Injectable({
  providedIn: 'root'
})
export class ResourceManagementService {
  private readonly API_BASE_URL = 'http://localhost:5000/api';
  private readonly ENDPOINT = '/manage_resources';

  private httpOptions = {
    headers: new HttpHeaders({
      'Content-Type': 'application/json'
    })
  };

  constructor(private http: HttpClient) {}

  /**
   * Check for schedule overlaps in a specific room (Day-based priority)
   */
  checkOverlap(
    roomId: string,
    date: string,
    startTime: string,
    endTime: string,
    day: string
  ): Observable<CheckOverlapResponse> {
    const payload: ManageResourcesRequest = {
      operation: 'check_overlap',
      room_id: roomId,
      start_time: startTime,
      end_time: endTime,
      day: day // Day is required and prioritized
    };
    
    // Add date as optional fallback
    if (date) {
      payload.date = date;
    }

    console.log('Check overlap payload (day-based priority):', payload);

    return this.http.post<CheckOverlapResponse>(
      `${this.API_BASE_URL}${this.ENDPOINT}`,
      payload,
      this.httpOptions
    ).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Search for existing schedules for reallocation
   */
  searchSchedules(
    searchQuery?: string,
    roomId?: string,
    day?: string,
    course?: string
  ): Observable<any> {
    const payload: ManageResourcesRequest = {
      operation: 'get_room_schedules'
    };

    if (roomId) payload.room_id = roomId;
    if (day) payload.day = day;
    if (course) payload.course = course;

    return this.http.post<any>(
      `${this.API_BASE_URL}${this.ENDPOINT}`,
      payload,
      this.httpOptions
    ).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Reallocate an existing schedule to a new room/time (Enhanced)
   */
  reallocateSchedule(
    scheduleId: string,
    newSchedule: {
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
    },
    originalScheduleDetails?: {
      original_day?: string;
      original_start_time?: string;
      original_end_time?: string;
      original_course?: string;
    }
  ): Observable<ReallocateResponse> {
    const payload: ManageResourcesRequest = {
      operation: 'reallocate',
      schedule_id: scheduleId,
      new_schedule: newSchedule,
      ...originalScheduleDetails // Spread original schedule details for unique identification
    };

    return this.http.post<ReallocateResponse>(
      `${this.API_BASE_URL}${this.ENDPOINT}`,
      payload,
      this.httpOptions
    ).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Inject a new schedule into the system (Fixed field mappings)
   */
  injectSchedule(
    roomId: string,
    date: string,
    startTime: string,
    endTime: string,
    day: string,
    additionalData?: {
      course?: string;
      department?: string;
      lecturer?: string;
      level?: string;
      year?: string;
    }
  ): Observable<InjectScheduleResponse> {
    const payload: ManageResourcesRequest = {
      operation: 'inject_schedule',
      room_id: roomId,  
      start_time: startTime,
      end_time: endTime,
      day: day, // Day is required and prioritized
      course: additionalData?.course || '',
      department: additionalData?.department || '',
      // Fix: Use 'instructor' field to match backend expectation
      instructor: additionalData?.lecturer || '',
      // Fix: Map level to year correctly
      year: additionalData?.year || additionalData?.level || ''
    };

    // Add date as optional (fallback if day-based fails)
    if (date) {
      payload.date = date;
    }

    return this.http.post<InjectScheduleResponse>(
      `${this.API_BASE_URL}${this.ENDPOINT}`,
      payload,
      this.httpOptions
    ).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Get room suggestions for a specific day and time (Day-based priority)
   */
  suggestRooms(
    date: string | null,
    startTime: string,
    endTime: string,
    day: string,
    roomId?: string,
    department?: string
  ): Observable<SuggestRoomsResponse> {
    const payload: ManageResourcesRequest = {
      operation: 'suggest_rooms',
      start_time: startTime,
      end_time: endTime,
      day: day // Day is required and prioritized
    };

    // Only add date if provided (optional fallback)
    if (date) {
      payload.date = date;
    }
    
    if (roomId) {
      payload.room_id = roomId;
    }
    
    if (department) {
      payload.department = department;
    }

    console.log('Suggest rooms payload (day-based priority):', payload);

    return this.http.post<SuggestRoomsResponse>(
      `${this.API_BASE_URL}${this.ENDPOINT}`,
      payload,
      this.httpOptions
    ).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Generic method for custom operations
   */
  executeOperation(payload: ManageResourcesRequest): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(
      `${this.API_BASE_URL}${this.ENDPOINT}`,
      payload,
      this.httpOptions
    ).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Enhanced error handling for multiple schedule matches
   */
  private handleError(error: any): Observable<never> {
    let errorMessage = 'An unknown error occurred';
    
    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Client Error: ${error.error.message}`;
    } else {
      // Server-side error
      if (error.error?.matching_schedules) {
        // Special handling for multiple schedule matches
        errorMessage = 'Multiple schedules found. Please select specific schedule.';
      } else {
        errorMessage = error.error?.error || `Server Error: ${error.status} ${error.message}`;
      }
    }
    
    console.error('ResourceManagementService Error:', errorMessage);
    console.error('Full error object:', error);
    return throwError(() => error); // Return full error object for detailed handling
  }

  /**
   * Utility method to validate time format (HH:MM)
   */
  validateTimeFormat(time: string): boolean {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(time);
  }

  /**
   * Utility method to validate date format (YYYY-MM-DD)
   */
  validateDateFormat(date: string): boolean {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    return dateRegex.test(date) && !isNaN(Date.parse(date));
  }
}