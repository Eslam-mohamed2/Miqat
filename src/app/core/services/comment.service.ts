import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, CommentDto, MentionableUserDto } from '../../models/api.models';
import { unwrapApi, unwrapApiList } from '../http/api-response';

@Injectable({
  providedIn: 'root'
})
export class CommentService {
  private apiUrl = `${environment.apiUrl}/api/Task`;

  constructor(private http: HttpClient) { }

  /** The thread for a task, oldest first. */
  getForTask(taskId: string): Observable<CommentDto[]> {
    return this.http
      .get<CommentDto[] | ApiResponse<CommentDto[]>>(`${this.apiUrl}/${taskId}/comments`)
      .pipe(unwrapApiList<CommentDto>());
  }

  /**
   * Mentions are sent as explicit user ids, not parsed out of the text on the
   * server: two people can share a display name, and a name typed into the box
   * is not proof the author picked that person from the list.
   */
  add(taskId: string, content: string, mentionedUserIds: string[] = []): Observable<CommentDto> {
    return this.http
      .post<CommentDto | ApiResponse<CommentDto>>(`${this.apiUrl}/${taskId}/comments`, {
        content,
        mentionedUserIds
      })
      .pipe(unwrapApi<CommentDto>());
  }

  /**
   * Who the caller may @mention here: the task's owner and assignee, everyone on
   * its project, and the caller's own friends. Friends come back with
   * `hasAccess: false` — mentioning one grants them access to the project.
   */
  getMentionable(taskId: string): Observable<MentionableUserDto[]> {
    return this.http
      .get<MentionableUserDto[] | ApiResponse<MentionableUserDto[]>>(`${this.apiUrl}/${taskId}/mentionable`)
      .pipe(unwrapApiList<MentionableUserDto>());
  }

  delete(commentId: string): Observable<void> {
    return this.http
      .delete<void | ApiResponse<void>>(`${this.apiUrl}/comments/${commentId}`)
      .pipe(unwrapApi<void>());
  }
}
