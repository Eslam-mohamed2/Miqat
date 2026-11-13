import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  ApiResponse, GroupCommentDto, GroupCommentPage, GroupDto, MemberDto, MentionableUserDto, PagedResult
} from '../../models/api.models';
import { unwrapApi, unwrapApiList, unwrapApiValue } from '../http/api-response';

@Injectable({
  providedIn: 'root'
})
export class GroupService {
  private apiUrl = `${environment.apiUrl}/api/Group`;

  constructor(private http: HttpClient) { }

  getGroups(): Observable<GroupDto[]> {
    return this.http.get<GroupDto[] | ApiResponse<GroupDto[]>>(this.apiUrl).pipe(unwrapApiList<GroupDto>());
  }

  createGroup(data: Partial<GroupDto>): Observable<GroupDto> {
    return this.http.post<GroupDto | ApiResponse<GroupDto>>(this.apiUrl, data).pipe(unwrapApi<GroupDto>());
  }

  getGroupById(id: string): Observable<GroupDto> {
    return this.http.get<GroupDto | ApiResponse<GroupDto>>(`${this.apiUrl}/${id}`).pipe(unwrapApi<GroupDto>());
  }

  updateGroup(id: string, data: Partial<GroupDto>): Observable<GroupDto> {
    return this.http.put<GroupDto | ApiResponse<GroupDto>>(`${this.apiUrl}/${id}`, data).pipe(unwrapApi<GroupDto>());
  }

  deleteGroup(id: string): Observable<void> {
    return this.http.delete<void | ApiResponse<void>>(`${this.apiUrl}/${id}`).pipe(unwrapApi<void>());
  }

  addMember(groupId: string, userId: string): Observable<void> {
    return this.http.post<void | ApiResponse<void>>(`${this.apiUrl}/${groupId}/members/${userId}`, {}).pipe(unwrapApi<void>());
  }

  removeMember(groupId: string, userId: string): Observable<void> {
    return this.http.delete<void | ApiResponse<void>>(`${this.apiUrl}/${groupId}/members/${userId}`).pipe(unwrapApi<void>());
  }

  /**
   * Members come back either as a bare array or as a paged `{ items }` result,
   * so both are normalised to a plain array here rather than at every call site.
   *
   * These are MemberDto rows, not UserDto: the person's id is `userId` and the
   * display name is `fullName`. Reading `.id`/`.name` off them yields undefined.
   */
  getMembers(groupId: string, pageIndex: number = 0, pageSize: number = 20): Observable<MemberDto[]> {
    const params = new HttpParams().set('pageIndex', pageIndex).set('pageSize', pageSize);
    return this.http
      .get<MemberDto[] | PagedResult<MemberDto> | ApiResponse<MemberDto[] | PagedResult<MemberDto>>>(
        `${this.apiUrl}/${groupId}/members`, { params }
      )
      .pipe(
        map(response => {
          const data = unwrapApiValue(response);
          if (Array.isArray(data)) return data;
          return data?.items ?? [];
        })
      );
  }

  // ── Discussion ─────────────────────────────────────────────────────────────
  // What the project's owner and members write to each other. An API build
  // without discussions answers 404 for all of these (see `discussionMissing`).

  /**
   * A page of the discussion, oldest first: the newest one, or with `before` (the
   * id of the first comment on screen) the page before it. `limit` counts comments
   * of their own; each comes with all its replies right after it.
   */
  getComments(groupId: string, before?: string | null, limit?: number): Observable<GroupCommentPage> {
    let params = new HttpParams();
    if (before) params = params.set('before', before);
    if (limit) params = params.set('limit', limit);
    return this.http
      .get<GroupCommentPage | ApiResponse<GroupCommentPage>>(`${this.apiUrl}/${groupId}/comments`, { params })
      .pipe(
        unwrapApi<GroupCommentPage>(),
        map(page => ({ comments: page?.comments ?? [], hasMore: !!page?.hasMore, total: page?.total ?? 0 }))
      );
  }

  /**
   * Writes a comment, or with `parentId` a reply. Mentions travel as the ids
   * picked from the list, as on a task. `clientId` comes back on the answer and
   * on the live event, so the sender can tell its own comment apart.
   */
  addComment(
    groupId: string,
    comment: { content: string; parentId?: string | null; mentionedUserIds?: string[]; clientId?: string }
  ): Observable<GroupCommentDto> {
    return this.http
      .post<GroupCommentDto | ApiResponse<GroupCommentDto>>(`${this.apiUrl}/${groupId}/comments`, {
        content: comment.content,
        parentId: comment.parentId ?? null,
        mentionedUserIds: comment.mentionedUserIds ?? [],
        clientId: comment.clientId ?? null
      })
      .pipe(unwrapApi<GroupCommentDto>());
  }

  /** Rewrites a comment of the discussion. Only its author may. */
  updateComment(commentId: string, content: string): Observable<GroupCommentDto> {
    return this.http
      .put<GroupCommentDto | ApiResponse<GroupCommentDto>>(`${this.apiUrl}/comments/${commentId}`, { content })
      .pipe(unwrapApi<GroupCommentDto>());
  }

  /** Deletes a comment and the replies to it. Its author or the project's owner may. */
  deleteComment(commentId: string): Observable<void> {
    return this.http
      .delete<void | ApiResponse<void>>(`${this.apiUrl}/comments/${commentId}`)
      .pipe(unwrapApi<void>());
  }

  /** Who can be @mentioned in the discussion: everyone on the project but the caller. */
  getMentionable(groupId: string): Observable<MentionableUserDto[]> {
    return this.http
      .get<MentionableUserDto[] | ApiResponse<MentionableUserDto[]>>(`${this.apiUrl}/${groupId}/mentionable`)
      .pipe(unwrapApiList<MentionableUserDto>());
  }
}

/**
 * True when a failed discussion request means "this server has no discussions":
 * an older API build has no such route and answers 404 with nothing in it, while
 * a build that has it always explains a 404 ("Project not found.").
 */
export function discussionMissing(err: unknown): boolean {
  const response = err as { status?: number; error?: unknown } | null;
  if (response?.status !== 404 && response?.status !== 405) return false;
  const body = response.error;
  if (body && typeof body === 'object') return !('message' in body);
  return typeof body !== 'string' || !body.includes('"message"');
}
