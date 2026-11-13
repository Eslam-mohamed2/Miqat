import { TestBed } from '@angular/core/testing';

import { AR, AR_PLURALS } from '../../core/i18n/ar';
import { useLanguageForTests } from '../../core/i18n/i18n';
import { TaskLinkDto } from '../../models/api.models';
import { TEST_PROVIDERS } from '../../../testing/test-providers';
import { TaskDependencies } from './task-dependencies';

function link(changes: Partial<TaskLinkDto> = {}): TaskLinkDto {
  return { id: 'a', title: 'Collect the photos', status: 'Pending', dueDate: '2026-11-20T12:00:00Z', isDone: false, ...changes };
}

/** The label at the end of a dependency row, in both languages. Nothing is loaded here. */
describe('TaskDependencies', () => {
  let links: TaskDependencies;

  function create() {
    TestBed.configureTestingModule({ imports: [TaskDependencies], providers: TEST_PROVIDERS });
    links = TestBed.createComponent(TaskDependencies).componentInstance;
  }

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-11-13T12:00:00Z'));
  });

  afterEach(() => {
    jasmine.clock().uninstall();
    useLanguageForTests('en');
  });

  describe('in English', () => {
    beforeEach(() => {
      useLanguageForTests('en');
      create();
    });

    it('names the status and the due day, day first as before', () => {
      expect(links.state(link())).toEqual({ text: 'To do · due 20 Nov', late: false });
      expect(links.state(link({ status: 'In_progress', dueDate: null }))).toEqual({ text: 'In progress', late: false });
    });

    it('says a finished task is done and counts the days of a late one', () => {
      expect(links.state(link({ isDone: true, status: 'Completed' }))).toEqual({ text: 'Done', late: false });
      expect(links.state(link({ dueDate: '2026-11-10T12:00:00Z' }))).toEqual({ text: '3d late', late: true });
      expect(links.state(link({ dueDate: '2026-11-12T12:00:00Z' }))).toEqual({ text: '1d late', late: true });
    });

    it('keeps a status it does not know as the API wrote it', () => {
      expect(links.details({ status: 'Needs_review', dueDate: null })).toBe('Needs review');
    });
  });

  describe('in Arabic', () => {
    beforeEach(() => {
      useLanguageForTests('ar', { dictionary: AR, plurals: AR_PLURALS });
      create();
    });

    it('names the status and the due day in Arabic', () => {
      expect(links.state(link())).toEqual({ text: 'للتنفيذ · الاستحقاق ٢٠ نوفمبر', late: false });
      expect(links.state(link({ status: 'In_progress', dueDate: null }))).toEqual({ text: 'قيد التنفيذ', late: false });
    });

    it('says a finished task is done and counts the days of a late one the Arabic way', () => {
      expect(links.state(link({ isDone: true, status: 'Completed' }))).toEqual({ text: 'مكتملة', late: false });
      expect(links.state(link({ dueDate: '2026-11-10T12:00:00Z' }))).toEqual({ text: 'متأخرة ٣ أيام', late: true });
      expect(links.state(link({ dueDate: '2026-11-11T12:00:00Z' }))).toEqual({ text: 'متأخرة يومين', late: true });
    });
  });
});
