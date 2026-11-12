import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SuggestTimesDto, TimeSlotDto, UserAvailabilityDto } from '../../models/api.models';
import { unwrapApiList } from '../http/api-response';

/** Free / busy times and "when can we all meet". */
@Injectable({
  providedIn: 'root'
})
export class ScheduleService {
  private apiUrl = `${environment.apiUrl}/api/Schedule`;

  constructor(private http: HttpClient) { }

  /** When each person is busy. The signed-in user is always part of the answer. */
  getAvailability(userIds: string[], from: Date, to: Date): Observable<UserAvailabilityDto[]> {
    let params = new HttpParams().set('from', from.toISOString()).set('to', to.toISOString());
    for (const id of userIds) params = params.append('userIds', id);
    return this.http
      .get<UserAvailabilityDto[]>(`${this.apiUrl}/availability`, { params })
      .pipe(unwrapApiList<UserAvailabilityDto>());
  }

  /** Times at which everyone is free, soonest first. */
  suggest(request: SuggestTimesDto): Observable<TimeSlotDto[]> {
    return this.http.post<TimeSlotDto[]>(`${this.apiUrl}/suggest`, request).pipe(unwrapApiList<TimeSlotDto>());
  }
}
