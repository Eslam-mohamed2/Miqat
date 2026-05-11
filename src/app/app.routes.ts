import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth-guard';
import { Main } from './main/main';

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
    path: 'main', 
    component: Main,
    canActivate: [authGuard]
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/app-shell/app-shell').then(m => m.AppShell),
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard-page/dashboard-page').then(m => m.DashboardPage)
      },
      {
        path: 'calendar',
        loadComponent: () => import('./features/calendar/calendar-page/calendar-page').then(m => m.CalendarPage)
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
        path: 'notifications',
        loadComponent: () => import('./features/notifications/notifications-page').then(m => m.NotificationsPage)
      },
      {
        path: 'mentions',
        loadComponent: () => import('./features/mentions/mentions-page').then(m => m.MentionsPage)
      },
      {
        path: 'profile/:id',
        loadComponent: () => import('./features/profile/profile-page').then(m => m.ProfilePage)
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
        path: 'node-flow/new',
        loadComponent: () => import('./features/node-flow/node-flow-page').then(m => m.NodeFlowPage)
      },
      {
        path: 'node-flow/:id',
        loadComponent: () => import('./features/node-flow/node-flow-page').then(m => m.NodeFlowPage)
      }
    ]
  }
];