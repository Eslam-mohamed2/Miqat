import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth-guard';

export const routes: Routes = [
  {
    path: 'authentication',
    loadComponent: () =>
      import('./authentication/authentication')
        .then(m => m.Authentication)
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./authentication/authentication')
        .then(m => m.Authentication)
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./authentication/authentication')
        .then(m => m.Authentication)
  },
  {
    path: 'authentication/forgot-password',
    loadComponent: () => import('./authentication/forgot-password/forgot-password').then(m => m.ForgotPasswordComponent)
  },
  {
    path: 'authentication/verify-otp',
    loadComponent: () => import('./authentication/verify-otp/verify-otp').then(m => m.VerifyOtpComponent)
  },
  {
    path: 'authentication/reset-password',
    loadComponent: () => import('./authentication/reset-password/reset-password').then(m => m.ResetPasswordComponent)
  },
  {
    // "Set up your week": the last step of signing up, once the account is verified.
    path: 'authentication/setup',
    canActivate: [authGuard],
    loadComponent: () => import('./authentication/setup-week/setup-week').then(m => m.SetupWeek)
  },
  {
    // A public booking link. No guard: the visitor need not have an account.
    path: 'book/:handle',
    loadComponent: () => import('./features/booking/booking-page').then(m => m.BookingPage)
  },
  {
    path: 'home',
    loadComponent: () =>
      import('./home/home')
        .then(m => m.Home)
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full'
  },
  {
    // The task list / board used to be linked as /kanban. Old links and bookmarks
    // land on the page that replaced it instead of on "page not found".
    path: 'kanban',
    redirectTo: 'tasks',
    pathMatch: 'full'
  },
  {
    // An old placeholder page. Links to it open the calendar, which replaced it.
    path: 'main',
    redirectTo: 'calendar',
    pathMatch: 'full'
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/app-shell/app-shell').then(m => m.AppShell),
    children: [
      {
        // "Plan my day" (design/miqat-2.0), on the address the dashboard used to have.
        // The design draws it without the rail: a full-window step with its own way back.
        path: 'dashboard',
        data: { focused: true },
        loadComponent: () => import('./features/dashboard/dashboard-page/dashboard-page').then(m => m.DashboardPage)
      },
      {
        // /tasks and /tasks/:id are one screen: the list or the board, with that
        // task open in the detail panel. One entry, so choosing a task keeps the page.
        matcher: segments =>
          segments[0]?.path === 'tasks' && segments.length <= 2
            ? { consumed: segments, posParams: segments[1] ? { id: segments[1] } : undefined }
            : null,
        loadComponent: () => import('./features/tasks/tasks-page').then(m => m.TasksPage)
      },
      {
        // /projects/:id and /projects/:id/discussion are one screen: the project,
        // with its Discussion section open on the second address. One entry, so
        // changing section keeps the page (as with /tasks above).
        matcher: segments =>
          segments[0]?.path === 'projects' && !!segments[1]
            && (segments.length === 2 || (segments.length === 3 && segments[2].path === 'discussion'))
            ? { consumed: segments, posParams: segments[2] ? { id: segments[1], section: segments[2] } : { id: segments[1] } }
            : null,
        loadComponent: () => import('./features/projects/project-page').then(m => m.ProjectPage)
      },
      {
        path: 'calendar',
        loadComponent: () => import('./features/calendar/calendar-page/calendar-page').then(m => m.CalendarPage)
      },
      {
        // "Find a time" / "Share times": when the people picked are all free.
        path: 'calendar/find-time',
        data: { focused: true },
        loadComponent: () => import('./features/calendar/find-time/find-time-page').then(m => m.FindTimePage)
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/settings/settings-page').then(m => m.SettingsPage)
      },
      {
        path: 'friends',
        loadComponent: () => import('./features/friends/friends-page').then(m => m.FriendsPage)
      },
      {
        // The Inbox (design/miqat-2.0: notifications and mentions in one place).
        path: 'inbox',
        loadComponent: () => import('./features/notifications/notifications-page').then(m => m.NotificationsPage)
      },
      {
        // Notifications and mentions used to be pages of their own. Old links open the Inbox.
        path: 'notifications',
        redirectTo: '/inbox',
        pathMatch: 'full'
      },
      {
        path: 'mentions',
        redirectTo: '/inbox?tab=mentions',
        pathMatch: 'full'
      },
      {
        path: 'help',
        loadComponent: () => import('./features/help/help-page').then(m => m.HelpPage)
      },
      {
        // A profile is the right-hand side of People (design/miqat-2.0): the old
        // address opens that screen with the person selected.
        path: 'profile/:id',
        redirectTo: ({ params }) => `/friends?person=${encodeURIComponent(params['id'])}`
      },
      {
        // The bare route is the board. `/new` and `/:id` stay so existing links
        // and bookmarks keep working.
        path: 'whiteboard',
        loadComponent: () => import('./features/whiteboard/whiteboard-page').then(m => m.WhiteboardPage)
      },
      {
        path: 'whiteboard/new',
        loadComponent: () => import('./features/whiteboard/whiteboard-page').then(m => m.WhiteboardPage)
      },
      {
        path: 'whiteboard/:id',
        loadComponent: () => import('./features/whiteboard/whiteboard-page').then(m => m.WhiteboardPage)
      },
      {
        path: 'node-flow',
        loadComponent: () => import('./features/node-flow/node-flow-page').then(m => m.NodeFlowPage)
      },
      {
        path: 'node-flow/new',
        loadComponent: () => import('./features/node-flow/node-flow-page').then(m => m.NodeFlowPage)
      },
      {
        path: 'node-flow/:id',
        loadComponent: () => import('./features/node-flow/node-flow-page').then(m => m.NodeFlowPage)
      }
    ]
  },
  {
    // Must stay last. Without it the router throws on any unmatched URL.
    path: '**',
    loadComponent: () => import('./shared/not-found/not-found').then(m => m.NotFound)
  }
];