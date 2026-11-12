import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AttachmentDto, CalendarItemKind } from '../../models/api.models';
import { unwrapApi, unwrapApiList } from '../http/api-response';

/** The API's own limit; checked here first so a large file fails before it is uploaded. */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/** Files attached to a task or an event. */
@Injectable({
  providedIn: 'root'
})
export class AttachmentService {
  private api = `${environment.apiUrl}/api`;

  constructor(private http: HttpClient) { }

  getForItem(kind: CalendarItemKind, itemId: string): Observable<AttachmentDto[]> {
    return this.http
      .get<AttachmentDto[]>(`${this.api}/${kind}/${itemId}/attachments`)
      .pipe(unwrapApiList<AttachmentDto>());
  }

  /** A document, an image or a zip, 10 MB at most. */
  upload(kind: CalendarItemKind, itemId: string, file: File): Observable<AttachmentDto> {
    const body = new FormData();
    body.append('file', file);
    return this.http
      .post<AttachmentDto>(`${this.api}/${kind}/${itemId}/attachments`, body)
      .pipe(unwrapApi<AttachmentDto>());
  }

  /**
   * The file itself. It is fetched through HttpClient rather than opened as a link
   * because the address needs the Authorization header, which a plain link cannot send.
   */
  download(attachmentId: string): Observable<Blob> {
    return this.http.get(`${this.api}/Attachment/${attachmentId}`, { responseType: 'blob' });
  }

  delete(attachmentId: string): Observable<void> {
    return this.http.delete<void>(`${this.api}/Attachment/${attachmentId}`);
  }
}
