import { ApplicationConfig } from '@angular/core';
import { OVERLAY_DEFAULT_CONFIG } from '@angular/cdk/overlay';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    // Since CDK 21, overlays (dialogs, menus, tooltips, snackbars) open in the browser's top layer
    // by default. Elements appended to <body>, such as quill-mention's suggestion list, can then
    // never appear above an open dialog, so keep overlays in the regular stacking order.
    { provide: OVERLAY_DEFAULT_CONFIG, useValue: { usePopover: false } }
  ]
};
