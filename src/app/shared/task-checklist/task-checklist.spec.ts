import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';

import { ChecklistProgress, TaskChecklist } from './task-checklist';
import { SubtaskDto } from '../../models/api.models';
import { TEST_PROVIDERS } from '../../../testing/test-providers';

function line(id: string, title: string, position: number, isDone = false): SubtaskDto {
  return { id, taskId: 't1', title, isDone, position, createdAt: '2026-11-12T10:00:00Z' };
}

describe('TaskChecklist', () => {
  let fixture: ComponentFixture<TaskChecklist>;
  let checklist: TaskChecklist;
  let http: HttpTestingController;

  const endsWith = (path: string) => (request: { url: string }) => request.url.endsWith(path);

  /** Creates the component and answers its first request with these lines. */
  function open(lines: SubtaskDto[]) {
    fixture.componentRef.setInput('taskId', 't1');
    fixture.detectChanges();
    http.expectOne(endsWith('/api/Task/t1/subtasks')).flush(lines);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskChecklist],
      providers: TEST_PROVIDERS
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TaskChecklist);
    checklist = fixture.componentInstance;
  });

  afterEach(() => http.verify());

  it('lists the lines top first and counts the ticked ones', () => {
    open([line('b', 'Second', 1, true), line('a', 'First', 0), line('c', 'Third', 2)]);

    expect(checklist.list().map(l => l.title)).toEqual(['First', 'Second', 'Third']);
    expect(checklist.doneCount()).toBe(1);
    expect(checklist.percent()).toBe(33);
  });

  it('shows a tick at once and reports the new count once it is saved', () => {
    open([line('a', 'First', 0), line('b', 'Second', 1)]);
    const reported: ChecklistProgress[] = [];
    checklist.changed.subscribe(progress => reported.push(progress));

    checklist.toggle(checklist.list()[0]);
    expect(checklist.list()[0].isDone).toBeTrue();
    expect(reported).toEqual([]);

    const request = http.expectOne(endsWith('/api/Task/subtasks/a'));
    expect(request.request.body).toEqual({ isDone: true });
    request.flush(line('a', 'First', 0, true));

    expect(reported).toEqual([{ total: 2, done: 1 }]);
    expect(checklist.busy()).toBeFalse();
  });

  it('puts a tick back and says why when the API refuses it', () => {
    open([line('a', 'First', 0)]);

    checklist.toggle(checklist.list()[0]);
    http.expectOne(endsWith('/api/Task/subtasks/a'))
      .flush({ message: 'You cannot change this task.' }, { status: 403, statusText: 'Forbidden' });

    expect(checklist.list()[0].isDone).toBeFalse();
    expect(checklist.error()).toBe('You cannot change this task.');
  });

  it('moves a line down and sends its new place', () => {
    open([line('a', 'First', 0), line('b', 'Second', 1), line('c', 'Third', 2)]);

    checklist.move(checklist.list()[0], 1);
    expect(checklist.list().map(l => l.title)).toEqual(['Second', 'First', 'Third']);
    expect(checklist.list().map(l => l.position)).toEqual([0, 1, 2]);

    const request = http.expectOne(endsWith('/api/Task/subtasks/a'));
    expect(request.request.body).toEqual({ position: 1 });
    request.flush(line('a', 'First', 1));
  });

  it('does not move the top line up or the bottom line down', () => {
    open([line('a', 'First', 0), line('b', 'Second', 1)]);

    checklist.move(checklist.list()[0], -1);
    checklist.move(checklist.list()[1], 1);

    http.expectNone(endsWith('/api/Task/subtasks/a'));
    http.expectNone(endsWith('/api/Task/subtasks/b'));
    expect(checklist.list().map(l => l.title)).toEqual(['First', 'Second']);
  });

  it('ignores a rename to nothing or to the same text', () => {
    open([line('a', 'First', 0)]);
    const first = checklist.list()[0];

    checklist.startRename(first);
    checklist.editText.set('   ');
    checklist.commitRename(first);

    checklist.startRename(first);
    checklist.editText.set('First');
    checklist.commitRename(first);

    http.expectNone(endsWith('/api/Task/subtasks/a'));
    expect(checklist.list()[0].title).toBe('First');
  });

  it('hides itself on an API build without checklists', () => {
    fixture.componentRef.setInput('taskId', 't1');
    fixture.detectChanges();
    http.expectOne(endsWith('/api/Task/t1/subtasks')).flush('', { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(checklist.available()).toBeFalse();
    expect((fixture.nativeElement as HTMLElement).classList).toContain('unavailable');
    expect(checklist.error()).toBeNull();
  });
});
