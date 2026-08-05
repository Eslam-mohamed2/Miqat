import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../models/api.models';
import { unwrapApi } from '../http/api-response';

export type BoardKind = 'Whiteboard' | 'NodeFlow';

export interface BoardDto {
  id: string;
  kind: BoardKind;
  name: string;
  /** JSON string owned by the editor that wrote it. */
  content: string;
  createdAt: string;
  updatedAt?: string | null;
}

@Injectable({ providedIn: 'root' })
export class BoardService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/api/Board`;

  list(kind?: BoardKind): Observable<BoardDto[]> {
    const query = kind ? `?kind=${kind}` : '';
    return this.http
      .get<BoardDto[] | ApiResponse<BoardDto[]>>(`${this.apiUrl}${query}`)
      .pipe(map(r => (Array.isArray(r) ? r : (r as ApiResponse<BoardDto[]>)?.data ?? [])));
  }

  /**
   * The caller's most recent board of a kind.
   *
   * The API answers 204 when there is none, which is the normal first run —
   * that arrives here as null, not as an error.
   */
  latest(kind: BoardKind): Observable<BoardDto | null> {
    return this.http
      .get<BoardDto | null>(`${this.apiUrl}/latest?kind=${kind}`, { observe: 'response' })
      .pipe(
        map(response => (response.status === 204 ? null : (response.body as BoardDto))),
        catchError(() => of(null))
      );
  }

  getById(id: string): Observable<BoardDto | null> {
    return this.http
      .get<BoardDto | ApiResponse<BoardDto>>(`${this.apiUrl}/${id}`)
      .pipe(unwrapApi<BoardDto>(), catchError(() => of(null)));
  }

  create(kind: BoardKind, content: string, name?: string): Observable<BoardDto> {
    return this.http
      .post<BoardDto | ApiResponse<BoardDto>>(this.apiUrl, { kind, content, name })
      .pipe(unwrapApi<BoardDto>());
  }

  update(id: string, kind: BoardKind, content: string, name?: string): Observable<BoardDto> {
    return this.http
      .put<BoardDto | ApiResponse<BoardDto>>(`${this.apiUrl}/${id}`, { kind, content, name })
      .pipe(unwrapApi<BoardDto>());
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
