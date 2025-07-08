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

@Injectable({
  providedIn: 'root'
})
export class ResourceManagementService {
  private readonly API_BASE_URL = 'http://your-backend-url'; // Replace with your actual backend URL
  private readonly ENDPOINT = '/manage_resources';

  private httpOptions = {
    headers: new HttpHeaders({
      'Content-Type': 'application/json'
    })
  };

  constructor(private http: HttpClient) {}

  /**
   * Check for schedule overlaps in a specific room
   */
  checkOverlap(
    roomId: string,
    date: string,
    startTime: string,
    endTime: string
  ): Observable<CheckOverlapResponse> {
    const payload: ManageResourcesRequest = {
      operation: 'check_overlap',
      room_id: roomId,
      date: date,
      start_time: startTime,
      end_time: endTime
    };

    return this.http.post<CheckOverlapResponse>(
      `${this.API_BASE_URL}${this.ENDPOINT}`,
      payload,
      this.httpOptions
    ).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Reallocate an existing schedule to a new room/time
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
    }
  ): Observable<ReallocateResponse> {
    const payload: ManageResourcesRequest = {
      operation: 'reallocate',
      schedule_id: scheduleId,
      new_schedule: newSchedule
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
   * Inject a new schedule into the system
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
      program?: string;
    }
  ): Observable<InjectScheduleResponse> {
    const payload: ManageResourcesRequest = {
      operation: 'inject_schedule',
      room_id: roomId,
      date: date,
      start_time: startTime,
      end_time: endTime,
      day: day,
      ...additionalData
    };

    return this.http.post<InjectScheduleResponse>(
      `${this.API_BASE_URL}${this.ENDPOINT}`,
      payload,
      this.httpOptions
    ).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Get room suggestions for a specific day and time
   */
  suggestRooms(
    date: string | null,
    startTime: string,
    endTime: string,
    day: string,
    department?: string
  ): Observable<SuggestRoomsResponse> {
    const payload: ManageResourcesRequest = {
      operation: 'suggest_rooms',
      start_time: startTime,
      end_time: endTime,
      day: day,
      department: department
    };

    // Only add date to payload if it's provided
    if (date) {
      payload.date = date;
    }

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
   * Error handling
   */
  private handleError(error: any): Observable<never> {
    let errorMessage = 'An unknown error occurred';
    
    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Client Error: ${error.error.message}`;
    } else {
      // Server-side error
      errorMessage = error.error?.error || `Server Error: ${error.status} ${error.message}`;
    }
    
    console.error('ResourceManagementService Error:', errorMessage);
    return throwError(() => new Error(errorMessage));
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