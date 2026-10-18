import { Routes } from '@angular/router';
import { DashboardPage } from './features/dashboard/dashboard.page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: DashboardPage },
  { path: '**', redirectTo: '' },
];
