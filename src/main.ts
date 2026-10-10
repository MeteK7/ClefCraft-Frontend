import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { authInterceptorFn } from './app/_services/auth.interceptor';  // Import the interceptor function

bootstrapApplication(AppComponent, {
  providers: [
    provideZoneChangeDetection(),
    importProvidersFrom(BrowserModule, FormsModule, BrowserAnimationsModule),
    provideHttpClient(withXhr(), withInterceptors([authInterceptorFn])),  // Register the interceptor function here
    provideAnimationsAsync(),
    ...(appConfig.providers || [])  // Spread additional providers from appConfig if available
  ]
}).catch(err => console.error(err));
