import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SearchResultsDto } from '../../models/api.models';
import { unwrapApi } from '../http/api-response';

/** The shortest text the API searches for; anything shorter answers 400. */
export const SEARCH_MIN_LENGTH = 2;

/** One search across tasks, projects, people and events, done by the server. */
@Injectable({
  providedIn: 'root'
})
export class SearchService {
  private apiUrl = `${environment.apiUrl}/api/Search`;

  constructor(private http: HttpClient) { }

  /** `limit` is per kind of thing, not in total. */
  search(query: string, limit = 6): Observable<SearchResultsDto> {
    const params = new HttpParams().set('query', query).set('limit', limit);
    return this.http.get<SearchResultsDto>(this.apiUrl, { params }).pipe(unwrapApi<SearchResultsDto>());
  }
}
