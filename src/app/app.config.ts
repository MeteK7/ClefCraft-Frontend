import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { OVERLAY_DEFAULT_CONFIG } from '@angular/cdk/overlay';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptorFn } from './_services/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection(),
    provideRouter(routes),
    provideHttpClient(withXhr(), withInterceptors([authInterceptorFn])),
    provideAnimationsAsync(),
    // Since CDK 21, overlays (dialogs, menus, tooltips, snackbars) open in the browser's top layer
    // by default. Elements appended to <body>, such as quill-mention's suggestion list, can then
    // never appear above an open dialog, so keep overlays in the regular stacking order.
    { provide: OVERLAY_DEFAULT_CONFIG, useValue: { usePopover: false } }
  ]
};
