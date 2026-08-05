import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  ApiResponse, CreateMentionsRequest, MentionDto, ParseMentionsRequest, UserDto
} from '../../models/api.models';
import { unwrapApi, unwrapApiList, unwrapNamedList, unwrapNamedValue } from '../http/api-response';

@Injectable({
  providedIn: 'root'
})
export class MentionService {
  private apiUrl = `${environment.apiUrl}/api/Mentions`;

  constructor(private http: HttpClient) { }

  // Both wrap their collection in a named property (`mentions` / `unreadMentions`)
  // rather than returning a bare array.
  getMentions(): Observable<MentionDto[]> {
    return this.http.get<unknown>(this.apiUrl).pipe(unwrapNamedList<MentionDto>('mentions'));
  }

  getUnreadMentions(): Observable<MentionDto[]> {
    return this.http.get<unknown>(`${this.apiUrl}/unread`).pipe(unwrapNamedList<MentionDto>('unreadMentions'));
  }

  /**
   * Returns `{ unreadCount: N }`. Coerced to a number so neither the wrapper
   * object nor a null payload can reach a badge as `[object Object]`.
   */
  getUnreadCount(): Observable<number> {
    return this.http.get<unknown>(`${this.apiUrl}/unread-count`).pipe(
      unwrapNamedValue<number>('unreadCount'),
      map(value => {
        const count = Number(value);
        return Number.isFinite(count) ? count : 0;
      })
    );
  }

  markMentionAsRead(mentionId: string): Observable<void> {
    return this.http.put<void | ApiResponse<void>>(`${this.apiUrl}/${mentionId}/read`, {}).pipe(unwrapApi<void>());
  }

  parseMentions(data: ParseMentionsRequest): Observable<UserDto[]> {
    return this.http.post<UserDto[] | ApiResponse<UserDto[]>>(`${this.apiUrl}/parse`, data).pipe(unwrapApiList<UserDto>());
  }

  createMentions(data: CreateMentionsRequest): Observable<void> {
    return this.http.post<void | ApiResponse<void>>(`${this.apiUrl}/create`, data).pipe(unwrapApi<void>());
  }
}
