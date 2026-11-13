import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';

import { CommentThread } from './comment-thread';
import { AuthService } from '../../core/services/auth.service';
import { discussionMissing } from '../../core/services/group.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { ToastService } from '../../core/services/toast.service';
import { CommentDto, GroupCommentDto } from '../../models/api.models';
import { TEST_PROVIDERS } from '../../../testing/test-providers';

const ME = 'me';
const SARA = 'sara';

function comment(id: string, content: string, extra: Partial<GroupCommentDto> = {}): GroupCommentDto {
  return {
    id, content, groupId: 'p1', parentId: null, authorId: SARA, authorName: 'Sara Ali',
    createdAt: `2026-11-13T10:${String(10 + Number(id.replace(/\D/g, '') || 0)).padStart(2, '0')}:00Z`,
    updatedAt: null, isEdited: false, canEdit: false, canDelete: false, ...extra
  };
}

describe('discussionMissing', () => {
  it('is true for a 404 that explains nothing: an API build without the route', () => {
    expect(discussionMissing({ status: 404, error: null })).toBeTrue();
    expect(discussionMissing({ status: 404, error: '' })).toBeTrue();
    expect(discussionMissing({ status: 405, error: null })).toBeTrue();
  });

  it('is false when the server says what was not found, and for any other failure', () => {
    expect(discussionMissing({ status: 404, error: { message: 'Project not found.' } })).toBeFalse();
    expect(discussionMissing({ status: 404, error: '{"message":"Project not found."}' })).toBeFalse();
    expect(discussionMissing({ status: 403, error: { message: 'You do not have access to this project.' } })).toBeFalse();
    expect(discussionMissing({ status: 500, error: null })).toBeFalse();
    expect(discussionMissing({ status: 0, error: null })).toBeFalse();
  });
});

describe('CommentThread', () => {
  let fixture: ComponentFixture<CommentThread>;
  let thread: CommentThread;
  let http: HttpTestingController;
  let live: RealtimeService;
  let counts: number[];

  const to = (method: string, path: string) => (request: { method: string; url: string }) =>
    request.method === method && request.url.endsWith(path);
  const shown = () => thread.comments().map(c => c.content);
  const drawn = () => thread.threads().map(t => [t.comment.content, ...t.replies.map(r => `> ${r.content}`)]).flat();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommentThread],
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: AuthService,
          useValue: {
            getCurrentUserId: () => ME,
            getCurrentUser: () => ({ id: ME, fullName: 'Mona Adel' }),
            isLoggedIn: () => false,
            getToken: () => null
          }
        }
      ]
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    live = TestBed.inject(RealtimeService);
    fixture = TestBed.createComponent(CommentThread);
    thread = fixture.componentInstance;
    counts = [];
    thread.countChange.subscribe(count => counts.push(count));
  });

  afterEach(() => http.verify());

  // ── A project's discussion ─────────────────────────────────────────────────

  describe('in a project', () => {
    /** Opens the discussion of project p1 and answers its first page. */
    function open(comments: GroupCommentDto[], hasMore = false, total = comments.length) {
      fixture.componentRef.setInput('projectId', 'p1');
      fixture.detectChanges();
      http.expectOne(to('GET', '/api/Group/p1/comments')).flush({ comments, hasMore, total });
      http.expectOne(to('GET', '/api/Group/p1/mentionable')).flush([]);
      fixture.detectChanges();
    }

    function write(text: string): TestRequest {
      thread.draft.set(text);
      thread.post();
      fixture.detectChanges();
      return http.expectOne(to('POST', '/api/Group/p1/comments'));
    }

    it('draws each comment with its replies under it, oldest first, and reports the count', () => {
      open([comment('c1', 'Plan?'), comment('c2', 'Design first', { parentId: 'c1' }), comment('c3', 'Budget approved')], false, 3);

      expect(thread.discussion()).toBeTrue();
      expect(drawn()).toEqual(['Plan?', '> Design first', 'Budget approved']);
      expect(counts).toEqual([3]);
      expect(fixture.nativeElement.querySelectorAll('.replies .comment-row').length).toBe(1);
      expect(fixture.nativeElement.querySelector('.composer-box textarea')).not.toBeNull();
    });

    it('says so, and offers no comment box, when the server has no discussions', () => {
      fixture.componentRef.setInput('projectId', 'p1');
      fixture.detectChanges();
      http.expectOne(to('GET', '/api/Group/p1/comments')).flush(null, { status: 404, statusText: 'Not Found' });
      http.expectOne(to('GET', '/api/Group/p1/mentionable')).flush(null, { status: 404, statusText: 'Not Found' });
      fixture.detectChanges();

      expect(thread.missing()).toBeTrue();
      expect(thread.loadError()).toBeNull();
      expect(fixture.nativeElement.querySelector('.state-title').textContent).toContain('not available on this server');
      expect(fixture.nativeElement.querySelector('.composer-box')).toBeNull();
    });

    it('shows why it could not load, and loads when asked again', () => {
      fixture.componentRef.setInput('projectId', 'p1');
      fixture.detectChanges();
      http.expectOne(to('GET', '/api/Group/p1/comments')).flush({ message: 'The server is restarting.' }, { status: 503, statusText: 'Unavailable' });
      http.expectOne(to('GET', '/api/Group/p1/mentionable')).flush([]);
      fixture.detectChanges();

      expect(thread.missing()).toBeFalse();
      expect(thread.loadError()).toBe('The server is restarting.');
      expect(fixture.nativeElement.querySelector('.composer-box')).toBeNull();

      thread.retryLoad();
      http.expectOne(to('GET', '/api/Group/p1/comments')).flush({ comments: [comment('c1', 'Back again')], hasMore: false, total: 1 });
      http.expectOne(to('GET', '/api/Group/p1/mentionable')).flush([]);
      fixture.detectChanges();

      expect(thread.loadError()).toBeNull();
      expect(shown()).toEqual(['Back again']);
    });

    it('offers Edit and Delete where the server allows them, whoever wrote the comment', () => {
      open([
        comment('c1', 'Mine', { authorId: ME, canEdit: true, canDelete: true }),
        comment('c2', 'Hers, and I own the project', { canDelete: true }),
        comment('c3', 'Hers')
      ]);

      const [mine, deletable, plain] = thread.comments();
      expect([thread.canEdit(mine), thread.canDelete(mine)]).toEqual([true, true]);
      expect([thread.canEdit(deletable), thread.canDelete(deletable)]).toEqual([false, true]);
      expect([thread.canEdit(plain), thread.canDelete(plain)]).toEqual([false, false]);
    });

    it('shows what others write, change and delete as it happens', () => {
      open([comment('c1', 'Plan?')], false, 1);

      live.projectCommentChanged$.next({ groupId: 'p1', action: 'added', comment: comment('c2', 'Design first', { parentId: 'c1' }), total: 2 });
      live.projectCommentChanged$.next({ groupId: 'p1', action: 'added', comment: comment('c3', 'Budget approved'), total: 3 });
      expect(drawn()).toEqual(['Plan?', '> Design first', 'Budget approved']);

      live.projectCommentChanged$.next({ groupId: 'p1', action: 'edited', comment: comment('c1', 'Plan for the week?', { updatedAt: '2026-11-13T11:00:00Z' }), total: 3 });
      expect(drawn()[0]).toBe('Plan for the week?');
      expect(thread.isEdited(thread.comments()[0])).toBeTrue();

      // The comment goes with the replies under it.
      live.projectCommentChanged$.next({ groupId: 'p1', action: 'deleted', deletedIds: ['c1', 'c2'], total: 1 });
      expect(drawn()).toEqual(['Budget approved']);
      expect(counts).toEqual([1, 2, 3, 3, 1]);
    });

    it('leaves alone what belongs elsewhere: another project, or a reply to a comment on a page not read yet', () => {
      open([comment('c5', 'Newest page')], true, 40);

      live.projectCommentChanged$.next({ groupId: 'other', action: 'added', comment: comment('x1', 'Elsewhere', { groupId: 'other' }), total: 9 });
      live.projectCommentChanged$.next({ groupId: 'p1', action: 'added', comment: comment('c6', 'Reply far up', { parentId: 'c0' }), total: 41 });
      live.projectCommentChanged$.next({ groupId: 'p1', action: 'edited', comment: comment('c0', 'Edited far up'), total: 41 });

      expect(shown()).toEqual(['Newest page']);
      // The count is the whole discussion's, so it still follows.
      expect(counts).toEqual([40, 41, 41]);
    });

    it('shows a comment the moment it is sent, then lets the server\'s answer take its place', () => {
      open([comment('c1', 'Plan?')], false, 1);

      const request = write('Sounds good');

      const row = thread.comments()[1];
      expect(row.state).toBe('sending');
      expect(row.authorName).toBe('Mona Adel');
      expect(thread.draft()).toBe('');
      expect(request.request.body.content).toBe('Sounds good');
      expect(request.request.body.parentId).toBeNull();
      expect(request.request.body.clientId).toBe(row.clientId);
      expect(thread.canEdit(row)).toBeFalse();

      request.flush(comment('c2', 'Sounds good', { authorId: ME, authorName: 'Mona Adel', canEdit: true, canDelete: true, clientId: row.clientId }));

      expect(shown()).toEqual(['Plan?', 'Sounds good']);
      expect(thread.comments()[1].id).toBe('c2');
      expect(thread.comments()[1].state).toBeUndefined();
      expect(thread.canEdit(thread.comments()[1])).toBeTrue();
      expect(counts).toEqual([1, 2]);
    });

    it('does not show a comment twice when its live event arrives before the answer', () => {
      open([], false, 0);

      const request = write('Hello');
      const clientId = thread.comments()[0].clientId!;
      const saved = comment('c9', 'Hello', { authorId: ME, canEdit: true, canDelete: true, clientId });

      live.projectCommentChanged$.next({ groupId: 'p1', action: 'added', comment: saved, total: 1 });
      expect(thread.comments().map(c => [c.id, c.state])).toEqual([['c9', undefined]]);

      request.flush(saved);
      expect(thread.comments().map(c => c.id)).toEqual(['c9']);
      expect(counts).toEqual([0, 1]);
    });

    it('keeps a comment that could not be sent, to send again or take back', () => {
      open([], false, 0);

      write('Is anyone there?').flush({ message: 'The server is restarting.' }, { status: 503, statusText: 'Unavailable' });

      let row = thread.comments()[0];
      expect(row.state).toBe('failed');
      expect(thread.error()).toBe('The server is restarting.');

      thread.retry(row);
      const again = http.expectOne(to('POST', '/api/Group/p1/comments'));
      expect(thread.comments()[0].state).toBe('sending');
      expect(again.request.body.clientId).toBe(row.clientId);
      again.error(new ProgressEvent('error'));

      row = thread.comments()[0];
      expect(row.state).toBe('failed');
      fixture.detectChanges();

      thread.discard(row);
      expect(thread.comments()).toEqual([]);
      // Nothing typed is lost: it is back in the box.
      expect(thread.draft()).toBe('Is anyone there?');
      expect(counts).toEqual([0]);
    });

    it('sends a reply under the comment being answered, also when "Reply" was pressed on a reply', () => {
      open([comment('c1', 'Plan?'), comment('c2', 'Design first', { parentId: 'c1' })], false, 2);

      thread.startReply(thread.comments()[1]);
      expect(thread.replyTo()?.id).toBe('c1');

      const request = write('Then the build');
      expect(request.request.body.parentId).toBe('c1');
      expect(thread.replyTo()).toBeNull();
      expect(drawn()).toEqual(['Plan?', '> Design first', '> Then the build']);
      request.flush(comment('c3', 'Then the build', { parentId: 'c1', authorId: ME, clientId: request.request.body.clientId }));

      thread.startReply(thread.comments()[0]);
      thread.cancelReply();
      const own = write('A comment of its own');
      expect(own.request.body.parentId).toBeNull();
      own.flush(comment('c4', 'A comment of its own', { authorId: ME, clientId: own.request.body.clientId }));
      expect(drawn()).toEqual(['Plan?', '> Design first', '> Then the build', 'A comment of its own']);
    });

    it('reads the page before the first comment on screen, once, and puts it above', () => {
      open([comment('c31', 'Thirty-one'), comment('c32', 'Reply', { parentId: 'c31' }), comment('c33', 'Thirty-three')], true, 40);

      thread.loadOlder();
      thread.loadOlder();
      const request = http.expectOne(to('GET', '/api/Group/p1/comments'));
      expect(request.request.params.get('before')).toBe('c31');
      expect(thread.loadingOlder()).toBeTrue();

      // A comment that is on screen already is not added again.
      request.flush({ comments: [comment('c29', 'Twenty-nine'), comment('c30', 'Thirty'), comment('c31', 'Thirty-one')], hasMore: false, total: 40 });
      fixture.detectChanges();

      expect(drawn()).toEqual(['Twenty-nine', 'Thirty', 'Thirty-one', '> Reply', 'Thirty-three']);
      expect(thread.hasMore()).toBeFalse();
      thread.loadOlder();
    });

    it('asks before deleting, takes the replies along, and puts everything back if the server refuses', () => {
      open([comment('c1', 'Plan?', { canDelete: true }), comment('c2', 'Design first', { parentId: 'c1' }), comment('c3', 'Budget approved')], false, 3);
      const toasts = TestBed.inject(ToastService);
      const ask = spyOn(window, 'confirm').and.returnValue(false);

      thread.remove(thread.comments()[0]);
      expect(ask.calls.mostRecent().args[0]).toBe('Delete this comment and the reply to it? This cannot be undone.');
      expect(shown().length).toBe(3);

      ask.and.returnValue(true);
      thread.remove(thread.comments()[0]);
      expect(shown()).toEqual(['Budget approved']);
      http.expectOne(to('DELETE', '/api/Group/comments/c1')).flush({ message: 'Only the comment\'s author or the project owner can delete it.' }, { status: 403, statusText: 'Forbidden' });
      expect(drawn()).toEqual(['Plan?', '> Design first', 'Budget approved']);
      expect(thread.error()).toContain('project owner');
      expect(toasts.toasts()).toEqual([]);

      thread.remove(thread.comments()[0]);
      http.expectOne(to('DELETE', '/api/Group/comments/c1')).flush(null, { status: 204, statusText: 'No Content' });
      expect(shown()).toEqual(['Budget approved']);
      expect(counts).toEqual([3, 1]);
      // Said once, with nothing to undo: a deleted comment cannot be brought back.
      expect(toasts.toasts().map(toast => [toast.text, toast.actionLabel])).toEqual([['Comment deleted', undefined]]);
    });

    it('saves an edit through the project\'s route', () => {
      open([comment('c1', 'Frist', { authorId: ME, canEdit: true, canDelete: true })]);

      thread.startEdit(thread.comments()[0]);
      thread.editDraft.set('First');
      thread.saveEdit(thread.comments()[0]);
      const request = http.expectOne(to('PUT', '/api/Group/comments/c1'));
      expect(request.request.body).toEqual({ content: 'First' });
      request.flush(comment('c1', 'First', { authorId: ME, canEdit: true, canDelete: true, updatedAt: '2026-11-13T11:00:00Z', isEdited: true }));

      expect(shown()).toEqual(['First']);
      expect(thread.isEdited(thread.comments()[0])).toBeTrue();
      expect(thread.editingId()).toBeNull();
    });
  });

  // ── A task's thread, as it has always been ─────────────────────────────────

  describe('on a task', () => {
    const taskComment = (id: string, content: string, authorId = SARA): CommentDto =>
      ({ id, content, taskId: 't1', authorId, authorName: authorId === ME ? 'Mona Adel' : 'Sara Ali', createdAt: '2026-11-13T10:00:00Z', updatedAt: null });

    function open(comments: CommentDto[]) {
      fixture.componentRef.setInput('taskId', 't1');
      fixture.detectChanges();
      http.expectOne(to('GET', '/api/Task/t1/comments')).flush(comments);
      http.expectOne(to('GET', '/api/Task/t1/mentionable')).flush([]);
      fixture.detectChanges();
    }

    it('reads the task\'s comments and draws them flat: no names line, no replies, no "Reply"', () => {
      open([taskComment('a', 'Hers'), taskComment('b', 'Mine', ME)]);

      expect(thread.discussion()).toBeFalse();
      expect(shown()).toEqual(['Hers', 'Mine']);
      const page: HTMLElement = fixture.nativeElement;
      expect(page.querySelectorAll('.comment-row').length).toBe(2);
      expect(page.querySelector('.who')).toBeNull();
      expect(page.querySelector('.replies')).toBeNull();
      expect(page.querySelector('.end')).toBeNull();
      // Edit and Delete on the caller's own comment only.
      expect([...page.querySelectorAll('.row-actions .link-btn')].map(button => button.textContent?.trim())).toEqual(['Edit', 'Delete']);
      expect(counts).toEqual([]);
    });

    it('adds a comment once the server has saved it (nothing is shown before)', () => {
      open([]);

      thread.draft.set('On it');
      thread.post();
      expect(shown()).toEqual([]);
      expect(thread.posting()).toBeTrue();
      const request = http.expectOne(to('POST', '/api/Task/t1/comments'));
      expect(request.request.body).toEqual({ content: 'On it', mentionedUserIds: [] });
      request.flush(taskComment('c', 'On it', ME));

      expect(shown()).toEqual(['On it']);
      expect(thread.posting()).toBeFalse();
    });

    it('deletes without asking, and reloads when someone else comments', () => {
      open([taskComment('a', 'Mine', ME)]);
      const ask = spyOn(window, 'confirm');

      thread.remove(thread.comments()[0]);
      expect(ask).not.toHaveBeenCalled();
      expect(shown()).toEqual([]);
      http.expectOne(to('DELETE', '/api/Task/comments/a')).flush(null);

      live.commentAdded$.next({ taskId: 'another' });
      live.commentAdded$.next({ taskId: 't1' });
      http.expectOne(to('GET', '/api/Task/t1/comments')).flush([taskComment('b', 'Hers')]);
      expect(shown()).toEqual(['Hers']);

      // A project's events are not this thread's business.
      live.projectCommentChanged$.next({ groupId: 't1', action: 'added', comment: comment('z', 'Stray'), total: 1 });
      expect(shown()).toEqual(['Hers']);
    });
  });
});
