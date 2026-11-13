import { parseQuickTask, QuickProject } from './quick-task';

describe('parseQuickTask', () => {
  const projects: QuickProject[] = [
    { id: 'b', name: 'Backend Engineers' },
    { id: 'l', name: 'Miqat Launch' },
    { id: 'm', name: 'Marketing Squad' }
  ];
  /** Thursday. */
  const today = 4;

  it('reads the example of the design', () => {
    const task = parseQuickTask('Review PR tomorrow ~30m #Backend !high', projects, today);

    expect(task.title).toBe('Review PR');
    expect(task.dueInDays).toBe(1);
    expect(task.dueLabel).toBe('Tomorrow');
    expect(task.estimate).toBe(30);
    expect(task.project?.id).toBe('b');
    expect(task.priority).toBe('High');
  });

  it('leaves a plain sentence alone', () => {
    const task = parseQuickTask('  Call the bank  ', projects, today);

    expect(task).toEqual({
      title: 'Call the bank', estimate: null, priority: null, project: null,
      dueInDays: null, dueLabel: null, unknownProject: null
    });
  });

  it('takes a weekday as the next such day', () => {
    expect(parseQuickTask('Plan sun', projects, today).dueInDays).toBe(3);
    expect(parseQuickTask('Plan Friday', projects, today).dueInDays).toBe(1);
    expect(parseQuickTask('Plan thursday', projects, today).dueInDays).toBe(7);
    expect(parseQuickTask('Plan thursday', projects, today).dueLabel).toBe('Thursday');
  });

  it('reads hours and minutes in an estimate', () => {
    expect(parseQuickTask('Spec ~1h', projects, today).estimate).toBe(60);
    expect(parseQuickTask('Spec ~1h30m', projects, today).estimate).toBe(90);
    expect(parseQuickTask('Spec ~1.5h', projects, today).estimate).toBe(90);
    expect(parseQuickTask('About ~ten', projects, today).title).toBe('About ~ten');
  });

  it('accepts a project name of several words', () => {
    const task = parseQuickTask('Draft post #miqat launch today', projects, today);

    expect(task.project?.id).toBe('l');
    expect(task.title).toBe('Draft post');
    expect(task.dueInDays).toBe(0);
  });

  it('keeps a "#name" that is no project in the title and says so', () => {
    const task = parseQuickTask('Fix #flaky test', projects, today);

    expect(task.project).toBeNull();
    expect(task.unknownProject).toBe('flaky');
    expect(task.title).toBe('Fix #flaky test');
  });

  it('reads a part as plain words when asked to', () => {
    const task = parseQuickTask('Sun protection research !low', projects, today, new Set(['due']));

    expect(task.title).toBe('Sun protection research');
    expect(task.dueInDays).toBeNull();
    expect(task.priority).toBe('Low');
  });

  it('does not take a word for a weekday or a priority because every object has it', () => {
    const task = parseQuickTask('Fix the constructor !toString', projects, today);

    expect(task.title).toBe('Fix the constructor !toString');
    expect(task.dueInDays).toBeNull();
    expect(task.priority).toBeNull();
  });

  describe('in Arabic', () => {
    const arabic: QuickProject[] = [...projects, { id: 't', name: 'التسويق' }, { id: 'w', name: 'أعمال المكتب' }];

    it('reads the same shorthand in Arabic words and digits', () => {
      const task = parseQuickTask('مراجعة العقد غدًا ~٤٥د #التسويق !عالية', arabic, today);

      expect(task.title).toBe('مراجعة العقد');
      expect(task.dueInDays).toBe(1);
      expect(task.estimate).toBe(45);
      expect(task.project?.id).toBe('t');
      expect(task.priority).toBe('High');
    });

    it('reads today, tomorrow and the weekdays however they are spelled', () => {
      expect(parseQuickTask('اتصال اليوم', arabic, today).dueInDays).toBe(0);
      expect(parseQuickTask('اتصال غدا', arabic, today).dueInDays).toBe(1);
      expect(parseQuickTask('اتصال غداً', arabic, today).dueInDays).toBe(1);
      expect(parseQuickTask('اجتماع الأحد', arabic, today).dueInDays).toBe(3);
      expect(parseQuickTask('اجتماع الاحد', arabic, today).dueInDays).toBe(3);
      expect(parseQuickTask('اجتماع الجمعة', arabic, today).dueInDays).toBe(1);
      expect(parseQuickTask('اجتماع الخميس', arabic, today).dueInDays).toBe(7);
      expect(parseQuickTask('اجتماع الخميس', arabic, today).title).toBe('اجتماع');
    });

    it('leaves a weekday without its article in the title', () => {
      const task = parseQuickTask('لا أحد يعرف', arabic, today);

      expect(task.title).toBe('لا أحد يعرف');
      expect(task.dueInDays).toBeNull();
    });

    it('reads priorities and estimates', () => {
      expect(parseQuickTask('تقرير !منخفضة', arabic, today).priority).toBe('Low');
      expect(parseQuickTask('تقرير !متوسط', arabic, today).priority).toBe('Medium');
      expect(parseQuickTask('تقرير !عاجلة', arabic, today).priority).toBe('Critical');
      expect(parseQuickTask('تقرير ~١س٣٠د', arabic, today).estimate).toBe(90);
      expect(parseQuickTask('تقرير ~٩٠', arabic, today).estimate).toBe(90);
      expect(parseQuickTask('Report ~٣٠m', arabic, today).estimate).toBe(30);
    });

    it('matches a project whichever alef its name is typed with', () => {
      const task = parseQuickTask('ترتيب #اعمال المكتب اليوم', arabic, today);

      expect(task.project?.id).toBe('w');
      expect(task.title).toBe('ترتيب');
      expect(task.dueInDays).toBe(0);
    });
  });
});
