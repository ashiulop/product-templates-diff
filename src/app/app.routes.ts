import { Routes } from '@angular/router';
import { DashboardPage } from './features/dashboard/dashboard.page';
import { ReviewPage } from './features/review/review.page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: DashboardPage },
  { path: 'engagements/:engagementId', component: ReviewPage },
  { path: '**', redirectTo: '' },
];
