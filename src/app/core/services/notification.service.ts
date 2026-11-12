import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, NotificationDto, PagedResult } from '../../models/api.models';
import { unwrapApi, unwrapApiList } from '../http/api-response';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private apiUrl = `${environment.apiUrl}/api/Notification`;

  constructor(private http: HttpClient) { }

  getNotifications(): Observable<NotificationDto[]> {
    return this.http.get<NotificationDto[] | ApiResponse<NotificationDto[]>>(this.apiUrl).pipe(unwrapApiList<NotificationDto>());
  }

  /** One page of the feed, newest first, with the true total for load-more. */
  getPaged(pageIndex: number, pageSize: number): Observable<PagedResult<NotificationDto>> {
    return this.http
      .get<PagedResult<NotificationDto> | ApiResponse<PagedResult<NotificationDto>>>(
        `${this.apiUrl}/paged?pageIndex=${pageIndex}&pageSize=${pageSize}`)
      .pipe(unwrapApi<PagedResult<NotificationDto>>());
  }

  getUnread(): Observable<NotificationDto[]> {
    return this.http.get<NotificationDto[] | ApiResponse<NotificationDto[]>>(`${this.apiUrl}/unread`).pipe(unwrapApiList<NotificationDto>());
  }

  markAsRead(id: string): Observable<void> {
    return this.http.put<void | ApiResponse<void>>(`${this.apiUrl}/${id}/read`, {}).pipe(unwrapApi<void>());
  }

  markAllAsRead(): Observable<void> {
    return this.http.put<void | ApiResponse<void>>(`${this.apiUrl}/read-all`, {}).pipe(unwrapApi<void>());
  }

  deleteNotification(id: string): Observable<void> {
    return this.http.delete<void | ApiResponse<void>>(`${this.apiUrl}/${id}`).pipe(unwrapApi<void>());
  }
}
