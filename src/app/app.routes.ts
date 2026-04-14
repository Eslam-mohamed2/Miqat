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
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/app-shell/app-shell').then(m => m.AppShell),
    children: [
      {
        path: '',
        loadComponent: () => import('./features/dashboard/dashboard-page/dashboard-page').then(m => m.DashboardPage)
      }
    ]
  }
];