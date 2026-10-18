import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { fakeBackendInterceptor } from './fake-backend/interceptor';
import { provideFakeBackend } from './fake-backend/provide-fake-backend';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([fakeBackendInterceptor])),
    provideFakeBackend(),
  ],
};
