import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

interface HelpAnswer {
  question: string;
  /** Steps or short paragraphs, shown as a list. */
  steps: string[];
  /** Where to go to do it. */
  link?: { label: string; route: string; query?: Record<string, string> };
}

interface HelpTopic {
  id: string;
  title: string;
  icon: string;
  summary: string;
  answers: HelpAnswer[];
}

/**
 * Everything on this page describes what the app does today. When a feature
 * changes, change its entry here too - a help page that is wrong is worse than
 * none.
 */
const TOPICS: HelpTopic[] = [
  {
    id: 'start',
    title: 'Getting started',
    icon: 'rocket_launch',
    summary: 'The first things to do in a new account.',
    answers: [
      {
        question: 'How do I add my first task?',
        steps: [
          'Press "+ Quick Add" at the top of any page.',
          'Give the task a title. Everything else (project, due date, priority, tags) is optional.',
          'Press "Create Task". It appears on the Tasks page, and on the Calendar if it has a due date.'
        ],
        link: { label: 'Open Tasks', route: '/tasks' }
      },
      {
        question: 'How do I create a project?',
        steps: [
          'Open the Projects panel with the folder icon in the top bar, or "New Project" in the sidebar.',
          'Press "New Project", type a name and pick a colour.',
          'The project appears under "Pinned projects" in the sidebar. Click it to open its page.'
        ],
        link: { label: 'Open the dashboard', route: '/dashboard' }
      },
      {
        question: 'What does the dashboard show?',
        steps: [
          'Productivity Flow counts your tasks by status and by priority. The button at the top right chooses the period it covers.',
          '"Export" downloads those tasks as a CSV file you can open in a spreadsheet.',
          'Coming Up lists your events and the tasks due in the next seven days; click a row to open it.',
          'Click any day on the small calendar to open that day in the Calendar.'
        ],
        link: { label: 'Open the dashboard', route: '/dashboard' }
      }
    ]
  },
  {
    id: 'tasks',
    title: 'Tasks',
    icon: 'task_alt',
    summary: 'Lists, the Kanban board, comments and due dates.',
    answers: [
      {
        question: 'How do I switch between the list and the Kanban board?',
        steps: [
          'Open Tasks from the sidebar.',
          'Use the "List" and "Kanban" buttons at the top right.',
          'On the board, drag a card to another column to change its status.'
        ],
        link: { label: 'Open Tasks', route: '/tasks' }
      },
      {
        question: 'How do I change a task\'s status or priority?',
        steps: [
          'In the list, use the status menu on the task\'s row.',
          'Or open the task and choose a step on the status bar, or a priority chip.',
          'Changes are saved as soon as you make them.'
        ],
        link: { label: 'Open Tasks', route: '/tasks' }
      },
      {
        question: 'How do I comment on a task or mention someone?',
        steps: [
          'Click a task to open its page.',
          'Write in the discussion box at the bottom. Type @ and pick a name to mention that person.',
          'They get a notification and the mention is listed on their Mentions page.',
          '"Edit" on a comment you wrote lets you change its text; it is then marked "edited". Mentioning someone new in an edit does not notify them.'
        ]
      },
      {
        question: 'How do I break a task into steps?',
        steps: [
          'Open the task. Under "Checklist", type a step in "Add a step" and press Enter.',
          'Tick a step when it is done. The count and the bar show how far along the task is.',
          'Click a step to rename it; the arrows move it up or down and the cross removes it.',
          'A task with steps shows its progress, for example "1/2", on the Tasks page and on project boards.'
        ],
        link: { label: 'Open Tasks', route: '/tasks' }
      },
      {
        question: 'How do I say that a task has to wait for another one?',
        steps: [
          'Open the task that has to wait. Under "Dependencies", press "Add a task this one waits for" and pick the other task.',
          'While that other task is not finished, this one is marked "Blocked" wherever it is listed.',
          '"Waiting on" lists what has to be finished first; "Blocking" lists the tasks that wait for this one.',
          'Two tasks cannot wait for each other: the second link is refused.'
        ],
        link: { label: 'Open Tasks', route: '/tasks' }
      },
      {
        question: 'How do I get reminded about a task, or attach a file to it?',
        steps: [
          'Open the task. Under "Reminders", pick when you want to hear about it, for example "1 hour before". The task needs a due date for a reminder to ring.',
          'Reminders are your own: other people on the task set theirs. You can have up to five on one task.',
          'Under "Files", press "Attach a file" to add a document, an image or a zip of up to 10 MB. Click a file to download it.'
        ],
        link: { label: 'Open Tasks', route: '/tasks' }
      },
      {
        question: 'How do I delete a task?',
        steps: [
          'In the list, use the bin icon at the end of the task\'s row, or open the task and choose Delete.',
          'You are asked to confirm. Deleting a task also removes its discussion and cannot be undone.'
        ]
      }
    ]
  },
  {
    id: 'projects',
    title: 'Projects and teams',
    icon: 'folder_special',
    summary: 'Group tasks, add members and follow progress.',
    answers: [
      {
        question: 'How do I add people to a project?',
        steps: [
          'Open the project from the sidebar and choose the "Members" tab.',
          'Pick a person from "+ Add member". The list holds your friends and people you already share a project with.',
          'They are notified that they were added.'
        ]
      },
      {
        question: 'Why is someone missing from the "Add member" list?',
        steps: [
          'Only your friends and existing teammates are offered.',
          'Send the person a friend request first; once they accept, they appear in the list.'
        ],
        link: { label: 'Find people', route: '/friends', query: { tab: 'suggestions' } }
      },
      {
        question: 'How do I see a project\'s tasks as a board?',
        steps: [
          'Open the project and use the "Table" and "Board" buttons above its tasks.',
          'In the table you can change status, priority and assignee directly in each row.'
        ]
      }
    ]
  },
  {
    id: 'calendar',
    title: 'Calendar',
    icon: 'calendar_today',
    summary: 'Events, invitations and every task with a due date, by month, week, day or as a list.',
    answers: [
      {
        question: 'How do I add an event?',
        steps: [
          'Press "New event" above the calendar, or the "+" on a day.',
          'Give it a title and set when it starts and ends. Switch on "All day" for a whole day, or several.',
          'Under "Guests", type the name of a friend or teammate to invite them. "Find a time everyone is free" suggests times that suit all of you.',
          'Choose "Repeat" for something that comes back every day, week, month or year, then press "Create event".'
        ],
        link: { label: 'Open the calendar', route: '/calendar' }
      },
      {
        question: 'How do I answer an invitation?',
        steps: [
          'Invitations wait under "Invitations" beside the calendar, and show on the grid with a dashed outline.',
          'Press "Going", "Maybe" or "Can\'t go". The organiser is told your answer.',
          'To change your mind, click the event on the calendar and pick another answer.'
        ],
        link: { label: 'Open the calendar', route: '/calendar' }
      },
      {
        question: 'How do I change or cancel one date of a repeating event?',
        steps: [
          'Click that date on the calendar, then the pencil to change it or the bin to remove it.',
          'Choose "Only this date" to leave the rest of the series alone, or "All dates" for the whole event.',
          'A date you changed says so when you open it, and "Put it back" returns it to the time of the series.'
        ],
        link: { label: 'Open the calendar', route: '/calendar' }
      },
      {
        question: 'How do I keep work and private events apart?',
        steps: [
          'Under "My Calendars", press "New", type a name and pick a colour.',
          'When you create an event, choose which calendar it goes in. Its colour on the grid is the calendar\'s colour.',
          'Untick a calendar to hide its events. The pencil beside it renames, recolours or deletes it; its events then move to your default calendar.'
        ],
        link: { label: 'Open the calendar', route: '/calendar' }
      },
      {
        question: 'How do I bring in events from Google Calendar, Outlook or Apple Calendar?',
        steps: [
          'In the other calendar, export your events as an .ics file.',
          'In Miqat, open the three-dot menu above the calendar and choose "Import an .ics file". The file can be up to 2 MB.',
          '"Export my events" in the same menu saves your Miqat events as an .ics file that other calendars can read.'
        ],
        link: { label: 'Open the calendar', route: '/calendar' }
      },
      {
        question: 'Why is a task not on the calendar?',
        steps: [
          'Only tasks with a due date are shown. Open the task and set one.',
          'Check "Tasks" on the right: a project whose box is unticked is hidden. "Personal" is for tasks that belong to no project.',
          'The number next to each project is how many of its tasks are due in the month on screen.'
        ],
        link: { label: 'Open the calendar', route: '/calendar' }
      },
      {
        question: 'How do I look at one day, one week or a list?',
        steps: [
          'Click a day to select it, then choose "Day" or "Week". Clicking the day number opens that day directly.',
          '"Agenda" shows the month as a list, one row for each event and task.',
          'The arrows move by whatever is on screen: a month, a week or a day. "Today" brings you back.'
        ],
        link: { label: 'Open the calendar', route: '/calendar' }
      },
      {
        question: 'How do I start the week on Monday or use a 24-hour clock?',
        steps: [
          'Open Settings and choose "Calendar", or pick "Calendar settings" in the three-dot menu above the calendar.',
          'Set "Week starts on", switch on "24-hour clock", and choose your working hours and working days.',
          'The same page sets how long a new event is and the reminder every new event gets. Press "Save calendar settings".'
        ],
        link: { label: 'Open calendar settings', route: '/settings', query: { tab: 'Calendar' } }
      },
      {
        question: 'Why do the times look wrong?',
        steps: [
          'The calendar shows times in the time zone saved in your profile.',
          'Use the globe button above the grid to switch to this device\'s zone or UTC.',
          'To change it for good, set your time zone in Settings.'
        ],
        link: { label: 'Open Settings', route: '/settings' }
      }
    ]
  },
  {
    id: 'boards',
    title: 'Whiteboard and Node Flow',
    icon: 'draw',
    summary: 'Sketch ideas and map how tasks connect.',
    answers: [
      {
        question: 'How do I use the whiteboard?',
        steps: [
          'Pick the pen and draw. Choose a colour from the toolbar; the eraser removes ink.',
          'Pick the sticky note, then click where it should go and type.',
          'With "Select & move" you can drag notes, and drag the board itself to reach the rest of a large drawing.',
          'Everything is saved automatically a moment after you stop.'
        ],
        link: { label: 'Open the whiteboard', route: '/whiteboard' }
      },
      {
        question: 'What is Node Flow?',
        steps: [
          'It lays your tasks out as boxes, in columns by status, so you can arrange them and draw connections.',
          'Drag a box to move it. Choose "Connect nodes" and click two boxes to link them.',
          'Click a task\'s box (with "Select & move") to open that task.'
        ],
        link: { label: 'Open Node Flow', route: '/node-flow' }
      },
      {
        question: 'Can I use them on a phone or tablet?',
        steps: [
          'Yes. Drag notes and boxes with a finger.',
          'On the whiteboard, choose "Select & move" and swipe to move around; choose the pen to draw.',
          'The Node Flow board scrolls sideways when it is wider than the screen.'
        ]
      }
    ]
  },
  {
    id: 'people',
    title: 'Friends, mentions and notifications',
    icon: 'people',
    summary: 'Connect with people and keep up with what they do.',
    answers: [
      {
        question: 'How do I add a friend?',
        steps: [
          'Open Friends from the people icon in the top bar.',
          'Under "People you may know", press "Add friend". Use the search box to find someone by name or email.',
          'Requests you receive are under "Friend requests": "Confirm" accepts, "Delete" declines.'
        ],
        link: { label: 'Open Friends', route: '/friends' }
      },
      {
        question: 'What happens when I click a notification?',
        steps: [
          'It opens the thing the notification is about: the task, the project, or the person.',
          'The line under each notification says which it is before you click.',
          'A note in the corner of the screen reminds you which notification brought you there.'
        ],
        link: { label: 'Open notifications', route: '/notifications' }
      },
      {
        question: 'How do I stop notifications?',
        steps: [
          'Open Settings and choose "Notifications".',
          'Turn off "In-app notifications" to stop new ones appearing in the bell menu.'
        ],
        link: { label: 'Open Settings', route: '/settings' }
      },
      {
        question: 'How do I block or unblock someone?',
        steps: [
          'On the Friends page, use the "…" button on their card and choose "Block". Their profile page has the same choice.',
          'They can no longer send you requests, and they disappear from your lists.',
          'To undo it, choose "Blocked" in the Friends menu and press "Unblock". Unblocking does not make them a friend again.'
        ],
        link: { label: 'See who is blocked', route: '/friends', query: { tab: 'blocked' } }
      }
    ]
  },
  {
    id: 'account',
    title: 'Your account',
    icon: 'manage_accounts',
    summary: 'Profile, picture, theme and password.',
    answers: [
      {
        question: 'How do I change my name, picture or time zone?',
        steps: [
          'Open Settings (bottom of the sidebar, or click your name).',
          'On the Profile tab, edit the fields and press "Save changes".',
          '"Change picture" uploads a JPG or PNG up to 5MB; "Remove" takes it off again.'
        ],
        link: { label: 'Open Settings', route: '/settings' }
      },
      {
        question: 'How do I switch between light and dark?',
        steps: [
          'The sun / moon button in the top bar switches straight away.',
          'In Settings, under Appearance, "System" makes Miqat follow your device and change with it.'
        ],
        link: { label: 'Open Settings', route: '/settings' }
      },
      {
        question: 'How do I change my password?',
        steps: [
          'Open Settings and choose "Security".',
          'Enter your current password and the new one twice. Use at least 8 characters with an uppercase letter, a number and a symbol.'
        ],
        link: { label: 'Open Settings', route: '/settings' }
      },
      {
        question: 'How do I change the email address I sign in with?',
        steps: [
          'Open Settings, choose "Security" and press "Change email".',
          'Type the new address and your current password, then press "Send code".',
          'Type the 6-digit code that arrives at the new address. Nothing changes until you do.',
          'From then on you sign in with the new address.'
        ],
        link: { label: 'Open Security settings', route: '/settings', query: { tab: 'Security' } }
      },
      {
        question: 'I forgot my password. What now?',
        steps: [
          'On the sign-in page choose "Forgot Password?" and enter your email address.',
          'Type the 6-digit code that is emailed to you, then choose a new password.'
        ]
      }
    ]
  },
  {
    id: 'shortcuts',
    title: 'Search and shortcuts',
    icon: 'keyboard',
    summary: 'Get around faster.',
    answers: [
      {
        question: 'How do I find a task, project, event or person quickly?',
        steps: [
          'Press Ctrl + K (Cmd + K on a Mac), or click the search box at the top. On a phone, open "Menu" and tap the search row.',
          'Type at least two letters. Use the arrow keys to move through the results and Enter to open one.',
          'An event opens in the calendar on its day.'
        ]
      },
      {
        question: 'Can I hide the sidebar?',
        steps: [
          '"Collapse" at the bottom of the sidebar shrinks it to icons.',
          'The × at its top right hides it completely; a small handle at the edge of the screen brings it back.',
          'Drag its right edge to make it wider or narrower.'
        ]
      }
    ]
  }
];

@Component({
  selector: 'app-help-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatIconModule],
  templateUrl: './help-page.html',
  styleUrl: './help-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HelpPage {
  readonly topics = TOPICS;

  searchText = signal('');
  /** The topic shown when nothing is being searched for. */
  activeTopicId = signal(TOPICS[0].id);
  /** Questions currently expanded, keyed by "topicId|question". */
  private openAnswers = signal<ReadonlySet<string>>(new Set([this.key(TOPICS[0], TOPICS[0].answers[0])]));

  readonly searching = computed(() => this.searchText().trim().length >= 2);

  /** Topics to show: all that match while searching, otherwise the selected one. */
  readonly visibleTopics = computed<HelpTopic[]>(() => {
    const term = this.searchText().trim().toLowerCase();
    if (term.length < 2) {
      return TOPICS.filter(topic => topic.id === this.activeTopicId());
    }
    return TOPICS
      .map(topic => ({
        ...topic,
        answers: topic.answers.filter(answer =>
          `${topic.title} ${answer.question} ${answer.steps.join(' ')}`.toLowerCase().includes(term))
      }))
      .filter(topic => topic.answers.length > 0);
  });

  readonly resultCount = computed(() =>
    this.visibleTopics().reduce((total, topic) => total + topic.answers.length, 0));

  selectTopic(topic: HelpTopic) {
    this.searchText.set('');
    this.activeTopicId.set(topic.id);
    // Open the first answer so the topic never arrives as a list of closed rows.
    this.openAnswers.set(new Set([this.key(topic, topic.answers[0])]));
  }

  toggle(topic: HelpTopic, answer: HelpAnswer) {
    const id = this.key(topic, answer);
    this.openAnswers.update(current => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  /** While searching, every match is open: the point is to read them. */
  isOpen(topic: HelpTopic, answer: HelpAnswer): boolean {
    return this.searching() || this.openAnswers().has(this.key(topic, answer));
  }

  clearSearch() {
    this.searchText.set('');
  }

  private key(topic: HelpTopic, answer: HelpAnswer): string {
    return `${topic.id}|${answer.question}`;
  }

  trackTopic = (_: number, topic: HelpTopic) => topic.id;
  trackAnswer = (_: number, answer: HelpAnswer) => answer.question;
}
