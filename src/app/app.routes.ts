import { Routes } from '@angular/router';
import { Home } from './home/home';
import { Authentication } from './authentication/authentication';

export const routes: Routes = [
  //default route (when user visits `/`)
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  //  main routes
  { path: 'home', component: Home },
  { path: 'auth', component: Authentication },
];
