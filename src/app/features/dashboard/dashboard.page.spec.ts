import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EngagementStatus, EngagementStatusSchema } from '../../contracts';
import { sortForDashboard } from './dashboard-logic';
import { DashboardPage } from './dashboard.page';

function identity(id: string, name: string) {
  return {
    engagementId: id,
    engagementName: name,
    templateId: `T-${id}`,
    templateName: `Template ${id}`,
  };
}

const tracked = { currentVersion: 3, declinedThroughVersion: null, latestVersion: 6, revision: 1 };

const statuses: EngagementStatus[] = [
  { ...identity('E-1', 'Zeta'), ...tracked, currentVersion: 6, state: 'up-to-date' },
  { ...identity('E-2', 'Mike'), state: 'not-yet-checked' },
  { ...identity('E-3', 'Yankee'), ...tracked, state: 'update-pending', pendingCount: 3 },
  { ...identity('E-4', 'Bravo'), ...tracked, declinedThroughVersion: 6, state: 'declined' },
  { ...identity('E-5', 'Alpha'), ...tracked, state: 'update-pending', pendingCount: 3 },
  { ...identity('E-6', 'Charlie'), ...tracked, currentVersion: 6, state: 'up-to-date' },
  { ...identity('E-7', 'Delta'), state: 'not-yet-checked' },
];

describe('DashboardPage', () => {
  it('renders rows in sortForDashboard order with Review links for tracked engagements', async () => {
    for (const status of statuses) {
      expect(EngagementStatusSchema.safeParse(status).success).toBe(true);
    }
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const httpTesting = TestBed.inject(HttpTestingController);

    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    httpTesting.expectOne('/api/engagements').flush(statuses);
    await fixture.whenStable();

    const element: HTMLElement = fixture.nativeElement;
    const names = Array.from(element.querySelectorAll('.name')).map((el) => el.textContent);
    expect(names).toEqual(sortForDashboard(statuses).map((s) => s.engagementName));

    const reviewLinks = Array.from(element.querySelectorAll('a')).filter(
      (a) => a.textContent === 'Review',
    );
    expect(reviewLinks).toHaveLength(statuses.filter((s) => s.state !== 'not-yet-checked').length);

    httpTesting.verify();
  });
});
