import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CalendarItemKind, ReminderDto } from '../../models/api.models';
import { unwrapApi, unwrapApiList } from '../http/api-response';

/** "Remind me N minutes before" on a task or an event. Each person sets their own. */
@Injectable({
  providedIn: 'root'
})
export class ReminderService {
  private api = `${environment.apiUrl}/api`;

  constructor(private http: HttpClient) { }

  /** Every reminder of the signed-in user that still has something ahead. */
  getUpcoming(): Observable<ReminderDto[]> {
    return this.http.get<ReminderDto[]>(`${this.api}/Reminder`).pipe(unwrapApiList<ReminderDto>());
  }

  getForItem(kind: CalendarItemKind, itemId: string): Observable<ReminderDto[]> {
    return this.http.get<ReminderDto[]>(`${this.api}/${kind}/${itemId}/reminders`).pipe(unwrapApiList<ReminderDto>());
  }

  /** 0 reminds at the start (or due) time itself. Up to five per item. */
  add(kind: CalendarItemKind, itemId: string, minutesBefore: number): Observable<ReminderDto> {
    return this.http
      .post<ReminderDto>(`${this.api}/${kind}/${itemId}/reminders`, { minutesBefore })
      .pipe(unwrapApi<ReminderDto>());
  }

  delete(reminderId: string): Observable<void> {
    return this.http.delete<void>(`${this.api}/Reminder/${reminderId}`);
  }

  /** Rings again in this many minutes instead of at its usual time. */
  snooze(reminderId: string, minutes: number): Observable<ReminderDto> {
    return this.http
      .post<ReminderDto>(`${this.api}/Reminder/${reminderId}/snooze`, { minutes })
      .pipe(unwrapApi<ReminderDto>());
  }
}
