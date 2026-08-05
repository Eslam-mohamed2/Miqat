import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { ApiResponse, GroupDto, MemberDto, PagedResult } from '../../models/api.models';
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
}
