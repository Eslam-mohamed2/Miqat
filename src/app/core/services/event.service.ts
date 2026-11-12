import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AttendeeStatus, EventDto, SaveEventDto, SaveOccurrenceDto } from '../../models/api.models';
import { unwrapApi, unwrapApiList } from '../http/api-response';

/** Calendar events: meetings and appointments, as opposed to tasks with a due date. */
@Injectable({
  providedIn: 'root'
})
export class EventService {
  private apiUrl = `${environment.apiUrl}/api/Event`;

  constructor(private http: HttpClient) { }

  /** Events that start in a range. A repeating event comes back once, not once per date. */
  getInRange(from: Date, to: Date, calendarId?: string): Observable<EventDto[]> {
    let params = new HttpParams().set('from', from.toISOString()).set('to', to.toISOString());
    if (calendarId) params = params.set('calendarId', calendarId);
    return this.http.get<EventDto[]>(this.apiUrl, { params }).pipe(unwrapApiList<EventDto>());
  }

  /** Events other people invited the signed-in user to. */
  getInvitations(): Observable<EventDto[]> {
    return this.http.get<EventDto[]>(`${this.apiUrl}/invitations`).pipe(unwrapApiList<EventDto>());
  }

  getById(id: string): Observable<EventDto> {
    return this.http.get<EventDto>(`${this.apiUrl}/${id}`).pipe(unwrapApi<EventDto>());
  }

  create(event: SaveEventDto): Observable<EventDto> {
    return this.http.post<EventDto>(this.apiUrl, event).pipe(unwrapApi<EventDto>());
  }

  /** Replaces the whole event. Guests and reminders are changed through their own calls. */
  update(id: string, event: SaveEventDto): Observable<EventDto> {
    return this.http.put<EventDto>(`${this.apiUrl}/${id}`, event).pipe(unwrapApi<EventDto>());
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  /** Changes, or with `cancelled: true` skips, one date of a repeating event. */
  saveOccurrence(id: string, change: SaveOccurrenceDto): Observable<unknown> {
    return this.http.put(`${this.apiUrl}/${id}/occurrences`, change);
  }

  /** Puts one date of a repeating event back the way the series has it. */
  restoreOccurrence(id: string, occurrenceStart: string): Observable<void> {
    const params = new HttpParams().set('occurrenceStart', occurrenceStart);
    return this.http.delete<void>(`${this.apiUrl}/${id}/occurrences`, { params });
  }

  invite(id: string, userIds: string[]): Observable<EventDto> {
    return this.http.post<EventDto>(`${this.apiUrl}/${id}/attendees`, { userIds }).pipe(unwrapApi<EventDto>());
  }

  removeAttendee(id: string, userId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}/attendees/${userId}`);
  }

  /** The signed-in user's answer to an invitation. */
  respond(id: string, status: Exclude<AttendeeStatus, 'Pending'>): Observable<EventDto> {
    return this.http.put<EventDto>(`${this.apiUrl}/${id}/respond`, { status }).pipe(unwrapApi<EventDto>());
  }
}
