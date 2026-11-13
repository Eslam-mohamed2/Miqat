import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { latinDigits, num, t } from '../../core/i18n/i18n';
import { NumPipe, TCountPipe, TPipe } from '../../core/i18n/t.pipe';
import { UserMenu } from '../../layout/user-menu/user-menu';

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
  summary: string;
  answers: HelpAnswer[];
}

/**
 * Everything on this page describes what the app does today. When a feature
 * changes, change its entry here too - a help page that is wrong is worse than
 * none.
 *
 * Each sentence is looked up in the Arabic dictionary as a whole (core/i18n/ar/people.ts):
 * change the two together.
 */
const WRITTEN_TOPICS: HelpTopic[] = [
  {
    id: 'start',
    title: t('Getting started'),
    summary: t('The first things to do in a new account.'),
    answers: [
      {
        question: t('How do I get around?'),
        steps: [
          t('The rail on the left holds the sections: Calendar, Tasks, Whiteboard, Node Flow and People, with Inbox and Settings at the bottom.'),
          t('On a phone the bar at the bottom holds Day, Week, Tasks and Inbox; the other sections are in the menu behind your initials.'),
          t('Your initials at the top right of a page open your account menu: profile, Plan my day, Settings, the theme, this Help Center and Log out.')
        ],
        link: { label: t('Open the calendar'), route: '/calendar' }
      },
      {
        question: t('How do I add my first task?'),
        steps: [
          t('Press Ctrl + K (Cmd + K on a Mac) anywhere, or the round “+” on a phone, and choose to create a task. “New task” on the Tasks page does the same.'),
          t('Give the task a title. Everything else (project, due date, priority, estimate) is optional.'),
          t('It appears on the Tasks page, and on the Calendar when it has a due date or a time block.')
        ],
        link: { label: t('Open Tasks'), route: '/tasks' }
      },
      {
        question: t('How do I create a project?'),
        steps: [
          t('Press Ctrl + K (Cmd + K on a Mac) and choose to create a project. Type a name and pick a colour.'),
          t('Open a project to see its tasks and members. Tasks you add to it take its colour.')
        ],
        link: { label: t('Open Tasks'), route: '/tasks' }
      },
      {
        question: t('What is Plan my day?'),
        steps: [
          t('It lays your open tasks around today’s meetings and proposes a day. Nothing moves until you accept it.'),
          t('The guardrails it works inside (lunch, a buffer after meetings, prayer times, a cap on meetings) are in Settings under Planning and focus.')
        ],
        link: { label: t('Open Plan my day'), route: '/dashboard' }
      }
    ]
  },
  {
    id: 'tasks',
    title: t('Tasks'),
    summary: t('The list, the board, comments and due dates.'),
    answers: [
      {
        question: t('How do I switch between the list and the board?'),
        steps: [
          t('Open Tasks from the rail.'),
          t('Use “List” and “Board” at the top of the page.'),
          t('On the board, drag a card to another column to change its status.')
        ],
        link: { label: t('Open Tasks'), route: '/tasks' }
      },
      {
        question: t('How do I change a task’s status or priority?'),
        steps: [
          t('Click a task to open it beside the list, then change its status or priority there.'),
          t('Changes are saved as soon as you make them.')
        ],
        link: { label: t('Open Tasks'), route: '/tasks' }
      },
      {
        question: t('How do I comment on a task or mention someone?'),
        steps: [
          t('Open the task and write in its comment box. Type @ and pick a name to mention that person.'),
          t('They get a notification, and the mention is listed in their Inbox.'),
          t('You can edit a comment you wrote; it is then marked “edited”. Mentioning someone new in an edit does not notify them.')
        ]
      },
      {
        question: t('How do I break a task into steps?'),
        steps: [
          t('Open the task and add steps under “Subtasks”.'),
          t('Tick a step when it is done. The count shows how far along the task is.'),
          t('A task with steps shows its progress, for example “1/2”, wherever it is listed.')
        ],
        link: { label: t('Open Tasks'), route: '/tasks' }
      },
      {
        question: t('How do I say that a task has to wait for another one?'),
        steps: [
          t('Open the task that has to wait and add the other task under “Blocked by”.'),
          t('While that other task is not finished, this one is marked “Blocked” wherever it is listed.'),
          t('Two tasks cannot wait for each other: the second link is refused.')
        ],
        link: { label: t('Open Tasks'), route: '/tasks' }
      },
      {
        question: t('How do I get reminded about a task, or attach a file to it?'),
        steps: [
          t('Open the task and add a reminder, for example “1 hour before”. The task needs a due date for a reminder to ring.'),
          t('Reminders are your own: other people on the task set theirs. You can have up to five on one task.'),
          t('Attach a document, an image or a zip of up to 10 MB under the task’s files. Click a file to download it.')
        ],
        link: { label: t('Open Tasks'), route: '/tasks' }
      },
      {
        question: t('How do I give a task a time on my calendar?'),
        steps: [
          t('Give the task an estimate, then schedule it from the task itself or let Plan my day propose a time.'),
          t('A scheduled task shows on the calendar as a block; its due date stays its deadline.')
        ],
        link: { label: t('Open Tasks'), route: '/tasks' }
      }
    ]
  },
  {
    id: 'projects',
    title: t('Projects and teams'),
    summary: t('Group tasks, add members and follow progress.'),
    answers: [
      {
        question: t('How do I add people to a project?'),
        steps: [
          t('Open the project and go to its members.'),
          t('Pick a person to add. The list holds your friends and people you already share a project with.'),
          t('They are notified that they were added.')
        ]
      },
      {
        question: t('Why is someone missing from the list of people to add?'),
        steps: [
          t('Only your friends and existing teammates are offered.'),
          t('Send the person a friend request first; once they accept, they appear in the list.')
        ],
        link: { label: t('Find people'), route: '/friends', query: { tab: 'suggestions' } }
      },
      {
        question: t('Where do I see the projects I share with someone?'),
        steps: [
          t('Open People and select the person.'),
          t('“Shared projects” on their profile lists every project you are both on, with how much of it is done.')
        ],
        link: { label: t('Open People'), route: '/friends' }
      }
    ]
  },
  {
    id: 'calendar',
    title: t('Calendar'),
    summary: t('Events, invitations and every task with a date, by month, week or day.'),
    answers: [
      {
        question: t('How do I add an event?'),
        steps: [
          t('Press Ctrl + K (Cmd + K on a Mac) and choose to create an event, or use the calendar itself.'),
          t('Give it a title and set when it starts and ends, or make it last all day.'),
          t('Add guests by name: your friends and teammates can be invited.'),
          t('Choose a repeat for something that comes back every day, week, month or year.')
        ],
        link: { label: t('Open the calendar'), route: '/calendar' }
      },
      {
        question: t('How do I answer an invitation?'),
        steps: [
          t('Invitations arrive in your Inbox and show on the calendar.'),
          t('Accept, answer “maybe” or decline. The organiser is told your answer.'),
          t('To change your mind, open the event on the calendar and pick another answer.')
        ],
        link: { label: t('Open the Inbox'), route: '/inbox' }
      },
      {
        question: t('How do I find a time that suits someone else?'),
        steps: [
          t('Open People, select the person and press “Find a time”.'),
          t('Miqat looks at when you are both free inside both working days. Only free and busy times are shared, never what an event is.'),
          t('This works with friends and with people on your projects.')
        ],
        link: { label: t('Open People'), route: '/friends' }
      },
      {
        question: t('How do I change or cancel one date of a repeating event?'),
        steps: [
          t('Open that date on the calendar and change or remove it.'),
          t('Choose “Only this date” to leave the rest of the series alone, or “All dates” for the whole event.')
        ],
        link: { label: t('Open the calendar'), route: '/calendar' }
      },
      {
        question: t('How do I bring my Google calendar in?'),
        steps: [
          t('Open Settings, choose “Connected calendars” and press “Import” beside Google Calendar. The “⋯” menu above your calendars on the calendar page opens the same import.'),
          t('Sign in to Google in the window that opens, tick the calendars you want and press “Import”.'),
          t('It is a copy made at that moment: changes you make in Google later are not followed. Import again to refresh; events that are already here are updated, not added twice.')
        ],
        link: { label: t('Open Connected calendars'), route: '/settings', query: { tab: 'calendars' } }
      },
      {
        question: t('How do I bring in events from Outlook, Apple Calendar or a calendar file?'),
        steps: [
          t('In the other calendar, export your events as an .ics file.'),
          t('In Miqat, open Settings, choose “Connected calendars” and press “Import” beside “Import a calendar file”. The file can be up to 2 MB.'),
          t('“Export” on the same page saves your Miqat events as an .ics file that other calendars can read.'),
          t('Live sync with Google, Outlook or iCloud is not available yet.')
        ],
        link: { label: t('Open Connected calendars'), route: '/settings', query: { tab: 'calendars' } }
      },
      {
        question: t('How do I start the week on Monday or use a 24-hour clock?'),
        steps: [
          t('Open Settings and choose “Calendar and time”.'),
          t('Set “Week starts on”, “Time format”, your work week and your working hours. Each change is saved as you make it.'),
          t('The same page holds what a new event starts with: its length and its reminder.')
        ],
        link: { label: t('Open Calendar and time'), route: '/settings', query: { tab: 'calendar' } }
      },
      {
        question: t('How do I show prayer times and Hijri dates?'),
        steps: [
          t('Open Settings and choose “Calendar and time”.'),
          t('Switch on “Prayer times” and pick the calculation method. The times are worked out for the main city of your time zone.'),
          t('Switch on “Hijri dates” and pick the Hijri calendar. These choices are kept in this browser.')
        ],
        link: { label: t('Open Calendar and time'), route: '/settings', query: { tab: 'calendar' } }
      },
      {
        question: t('Which public holidays and occasions does the calendar show?'),
        steps: [
          t('The public holidays of your country, taken from your time zone, and the occasions of the Hijri calendar such as Ramadan and the two Eids. Each is a small diamond with its name on its day; press it to see what kind of day it is.'),
          t('Islamic dates are worked out ahead of the moon sighting, so they are marked “Date may vary”.'),
          t('To pick another country or switch the layer off, open Settings, choose “Calendar and time” and use “Holidays and occasions” and “Holidays for”.')
        ],
        link: { label: t('Open Calendar and time'), route: '/settings', query: { tab: 'calendar' } }
      },
      {
        question: t('Why do the times look wrong?'),
        steps: [
          t('The calendar shows times in the time zone saved in Settings under “Calendar and time”.'),
          t('Change “Time zone” there; “Second time zone” adds another column of hours beside it.')
        ],
        link: { label: t('Open Calendar and time'), route: '/settings', query: { tab: 'calendar' } }
      }
    ]
  },
  {
    id: 'boards',
    title: t('Whiteboard and Node Flow'),
    summary: t('Sketch ideas and map how tasks connect.'),
    answers: [
      {
        question: t('How do I use the whiteboard?'),
        steps: [
          t('Draw with the pen and add sticky notes, frames, shapes, text and connectors from the tool bar.'),
          t('Move things with the Select tool; the Pan tool moves the board itself.'),
          t('Select sticky notes and choose "Make tasks" to turn them into tasks.'),
          t('Everything is saved automatically a moment after you stop.')
        ],
        link: { label: t('Open the whiteboard'), route: '/whiteboard' }
      },
      {
        question: t('What is Node Flow?'),
        steps: [
          t('It lays your tasks, events and milestones out as boxes so you can draw how they depend on each other.'),
          t('Drag a box to move it, and connect two boxes to link them.'),
          t('The critical path is marked, and the timeline shows the same plan against dates.')
        ],
        link: { label: t('Open Node Flow'), route: '/node-flow' }
      }
    ]
  },
  {
    id: 'people',
    title: t('People, chat and notifications'),
    summary: t('Connect with people and keep up with what they do.'),
    answers: [
      {
        question: t('How do I add a friend?'),
        steps: [
          t('Open People from the rail and press “Add friend”.'),
          t('Miqat lists people you may know; type a name or an email address to search for anyone else.'),
          t('Press “Add” beside a person. The request waits under “Requests” until they answer; “Cancel” there takes it back.')
        ],
        link: { label: t('Find people'), route: '/friends', query: { tab: 'suggestions' } }
      },
      {
        question: t('How do I answer a friend request?'),
        steps: [
          t('Open People and choose “Requests”.'),
          t('“Accept” makes you friends. “Decline” removes the request; the other person is not told.')
        ],
        link: { label: t('Open Requests'), route: '/friends', query: { tab: 'requests' } }
      },
      {
        question: t('What does a person’s profile show?'),
        steps: [
          t('Their local time and whether they are online; “In a meeting” when their calendar says so right now.'),
          t('“Your day and theirs” lines up your working hours with theirs, in your time. Miqat cannot see another person’s working hours, so their bar assumes 09:00 to 17:00 in their time zone.'),
          t('The best window and the shared working days under the chart come from when Miqat finds you both free in the coming week.'),
          t('“Next together” lists events you both attend, and “Shared projects” the projects you are both on.')
        ],
        link: { label: t('Open People'), route: '/friends' }
      },
      {
        question: t('How do I message or call a friend?'),
        steps: [
          t('Press “Message” on their profile, or the round chat button at the bottom right and pick them.'),
          t('In the chat window, the phone and camera buttons start a voice or a video call.'),
          t('An incoming call rings at the top right: accept or decline it there. Escape declines.'),
          t('For several friends at once, press “New group” in the chat list or on the People page, name the group and pick at least two friends. Its name in the chat window opens the members: add people or leave there; the group’s admins can also rename it and remove people.'),
          t('The phone and camera buttons of a group start a call for up to 8 people. It rings for the others, and anyone in the group can join for as long as it is going: the chat shows “Call in progress” with “Join”.')
        ],
        link: { label: t('Open People'), route: '/friends' }
      },
      {
        question: t('How do I choose which notifications I get?'),
        steps: [
          t('Open Settings and choose “Notifications”.'),
          t('There is one switch for live notifications (in Miqat and on devices with push), one for email and one for the weekly recap, so ticking a box changes its whole column.'),
          t('“This device” on the same page turns on push for this browser.')
        ],
        link: { label: t('Open Notifications'), route: '/settings', query: { tab: 'notifications' } }
      },
      {
        question: t('How do I block or unblock someone?'),
        steps: [
          t('Open their profile in People, press the “…” button and choose “Block”.'),
          t('They can no longer send you friend requests or messages, and a friendship between you ends. They are not told.'),
          t('To undo it, choose “Blocked” in People, or “Blocked people” in Settings, and press “Unblock”. Unblocking does not make them a friend again.')
        ],
        link: { label: t('See who is blocked'), route: '/friends', query: { tab: 'blocked' } }
      }
    ]
  },
  {
    id: 'account',
    title: t('Your account'),
    summary: t('Profile, picture, theme, email and password.'),
    answers: [
      {
        question: t('How do I change my name, picture or time zone?'),
        steps: [
          t('Open Settings from the rail. Under “Profile”, press “Edit” beside a value, type the new one and press Enter. It is saved straight away.'),
          t('“Upload” adds a JPG or PNG of up to 5 MB as your picture; “Remove” takes it off again.'),
          t('Your time zone is under “Calendar and time”.')
        ],
        link: { label: t('Open Settings'), route: '/settings' }
      },
      {
        question: t('How do I switch between light and dark, or change the accent colour?'),
        steps: [
          t('Open Settings and choose “Appearance”, or use “Theme” in the menu behind your initials.'),
          t('“System” makes Miqat follow your device and change with it.'),
          t('The accent colour and “Reduce motion” are kept in this browser.')
        ],
        link: { label: t('Open Appearance'), route: '/settings', query: { tab: 'appearance' } }
      },
      {
        question: t('How do I change my password?'),
        steps: [
          t('Open Settings, choose “Account” and press “Change” beside Password.'),
          t('Enter your current password and the new one twice. Use at least 8 characters with an uppercase letter, a number and a symbol.')
        ],
        link: { label: t('Open Account'), route: '/settings', query: { tab: 'account' } }
      },
      {
        question: t('How do I change the email address I sign in with?'),
        steps: [
          t('Open Settings, choose “Account” and press “Change” beside Email.'),
          t('Type the new address and your current password, then press “Send code”.'),
          t('Type the 6-digit code that arrives at the new address. Nothing changes until you do.'),
          t('From then on you sign in with the new address.')
        ],
        link: { label: t('Open Account'), route: '/settings', query: { tab: 'account' } }
      },
      {
        question: t('I forgot my password. What now?'),
        steps: [
          t('On the sign-in page choose the forgotten-password link and enter your email address.'),
          t('Type the 6-digit code that is emailed to you, then choose a new password.')
        ]
      }
    ]
  },
  {
    id: 'shortcuts',
    title: t('Search and shortcuts'),
    summary: t('Get around faster.'),
    answers: [
      {
        question: t('How do I find a task, project, event or person quickly?'),
        steps: [
          t('Press Ctrl + K (Cmd + K on a Mac). On a phone, press the round “+” in the bar at the bottom.'),
          t('Type at least two letters. Use the arrow keys to move through the results and Enter to open one.'),
          t('An event opens in the calendar on its day; a person opens in People.')
        ]
      },
      {
        question: t('Can I create things from the same box?'),
        steps: [
          t('Yes. The box that opens with Ctrl + K also creates a task, an event or a project.')
        ]
      }
    ]
  }
];

/** Digits written in an answer ("up to 10 MB") follow the digit style chosen in Settings. */
const TOPICS: HelpTopic[] = WRITTEN_TOPICS.map(topic => ({
  ...topic,
  title: num(topic.title),
  summary: num(topic.summary),
  answers: topic.answers.map(answer => ({
    ...answer,
    question: num(answer.question),
    steps: answer.steps.map(step => num(step)),
    link: answer.link ? { ...answer.link, label: num(answer.link.label) } : undefined
  }))
}));

/**
 * What a search compares: lower case, 0-9 for digits, and for Arabic no marks and
 * one form for the letters people type interchangeably (أ إ آ as ا, ى as ي, ة as ه).
 */
function searchable(text: string): string {
  return latinDigits(text).toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}

/**
 * The Help Center, laid out like Settings (design/miqat-2.0): topics on the left,
 * the open topic's questions on the right as a card of rows.
 */
@Component({
  selector: 'app-help-page',
  standalone: true,
  imports: [RouterLink, UserMenu, TPipe, TCountPipe, NumPipe],
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
  readonly activeTopic = computed(() => TOPICS.find(topic => topic.id === this.activeTopicId()) ?? TOPICS[0]);

  /** Topics to show: all that match while searching, otherwise the selected one. */
  readonly visibleTopics = computed<HelpTopic[]>(() => {
    const term = searchable(this.searchText().trim());
    if (term.length < 2) {
      return TOPICS.filter(topic => topic.id === this.activeTopicId());
    }
    return TOPICS
      .map(topic => ({
        ...topic,
        answers: topic.answers.filter(answer =>
          searchable(`${topic.title} ${answer.question} ${answer.steps.join(' ')}`).includes(term))
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
}
