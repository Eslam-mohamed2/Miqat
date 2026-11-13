import { Route, UrlMatchResult, UrlSegment, UrlSegmentGroup } from '@angular/router';

import { routes } from '../../app.routes';

/**
 * The project page has two addresses and must stay one route entry, so that
 * going from Tasks to Discussion keeps the page instead of loading it again.
 */
describe('the routes of a project', () => {
  const everyRoute = (list: Route[]): Route[] => list.flatMap(route => [route, ...everyRoute(route.children ?? [])]);
  const match = (route: Route, url: string): UrlMatchResult | null =>
    route.matcher?.(url.split('/').filter(Boolean).map(part => new UrlSegment(part, {})), new UrlSegmentGroup([], {}), route) ?? null;

  const matching = (url: string) => everyRoute(routes).filter(route => match(route, url));
  const project = () => matching('/projects/p1')[0];

  it('/projects/:id and /projects/:id/discussion are one entry', () => {
    expect(matching('/projects/p1').length).toBe(1);
    expect(matching('/projects/p1/discussion')).toEqual([project()]);
    expect(project().loadComponent).toBeDefined();
  });

  it('hands the page the project, and the section when the address names it', () => {
    const tasks = match(project(), '/projects/p1')!;
    expect(tasks.consumed.length).toBe(2);
    expect(tasks.posParams?.['id'].path).toBe('p1');
    expect(tasks.posParams?.['section']).toBeUndefined();

    const discussion = match(project(), '/projects/p1/discussion')!;
    expect(discussion.consumed.length).toBe(3);
    expect(discussion.posParams?.['id'].path).toBe('p1');
    expect(discussion.posParams?.['section'].path).toBe('discussion');
  });

  it('is nothing else', () => {
    for (const url of ['/projects', '/projects/p1/members', '/projects/p1/discussion/c1', '/project/p1', '/tasks/p1']) {
      expect(match(project(), url)).withContext(url).toBeNull();
    }
  });
});
