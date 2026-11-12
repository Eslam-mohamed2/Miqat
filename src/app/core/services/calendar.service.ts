import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CalendarItemDto, CalendarSettingsDto, ImportResultDto, SaveCalendarDto, UserCalendarDto
} from '../../models/api.models';
import { unwrapApi, unwrapApiList } from '../http/api-response';

/**
 * The calendar itself: the feed that says what is on which date, the user's
 * calendars ("Personal", "Work", ...), their calendar preferences and .ics files.
 */
@Injectable({
  providedIn: 'root'
})
export class CalendarService {
  private apiUrl = `${environment.apiUrl}/api/Calendar`;

  constructor(private http: HttpClient) { }

  /**
   * Everything on the calendar between two moments: events and tasks, with a
   * repeating one already spread over its dates. Hidden calendars are left out.
   */
  getFeed(from: Date, to: Date, includeTasks = true): Observable<CalendarItemDto[]> {
    const params = new HttpParams()
      .set('from', from.toISOString())
      .set('to', to.toISOString())
      .set('includeTasks', includeTasks);
    return this.http.get<CalendarItemDto[]>(`${this.apiUrl}/feed`, { params }).pipe(unwrapApiList<CalendarItemDto>());
  }

  getCalendars(): Observable<UserCalendarDto[]> {
    return this.http.get<UserCalendarDto[]>(this.apiUrl).pipe(unwrapApiList<UserCalendarDto>());
  }

  createCalendar(calendar: SaveCalendarDto): Observable<UserCalendarDto> {
    return this.http.post<UserCalendarDto>(this.apiUrl, calendar).pipe(unwrapApi<UserCalendarDto>());
  }

  /** Renames, recolours, hides or shows a calendar. Values left out stay as they are. */
  updateCalendar(id: string, changes: SaveCalendarDto): Observable<UserCalendarDto> {
    return this.http.put<UserCalendarDto>(`${this.apiUrl}/${id}`, changes).pipe(unwrapApi<UserCalendarDto>());
  }

  /** Its events move to the default calendar; the default one cannot be deleted. */
  deleteCalendar(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  getSettings(): Observable<CalendarSettingsDto> {
    return this.http.get<CalendarSettingsDto>(`${this.apiUrl}/settings`).pipe(unwrapApi<CalendarSettingsDto>());
  }

  saveSettings(settings: CalendarSettingsDto): Observable<CalendarSettingsDto> {
    return this.http.put<CalendarSettingsDto>(`${this.apiUrl}/settings`, settings).pipe(unwrapApi<CalendarSettingsDto>());
  }

  /** The user's events as an .ics file; one calendar, or all of them. */
  exportIcs(calendarId?: string): Observable<Blob> {
    const params = calendarId ? new HttpParams().set('calendarId', calendarId) : undefined;
    return this.http.get(`${this.apiUrl}/export`, { params, responseType: 'blob' });
  }

  /** Reads an .ics file (2 MB at most) into a calendar; left out, the default one. */
  importIcs(file: File, calendarId?: string): Observable<ImportResultDto> {
    const body = new FormData();
    body.append('file', file);
    const params = calendarId ? new HttpParams().set('calendarId', calendarId) : undefined;
    return this.http.post<ImportResultDto>(`${this.apiUrl}/import`, body, { params }).pipe(unwrapApi<ImportResultDto>());
  }
}
