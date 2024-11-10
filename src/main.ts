import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { importProvidersFrom } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ToastrModule } from 'ngx-toastr';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptorFn } from './app/_services/auth.interceptor';  // Import the interceptor function

bootstrapApplication(AppComponent, {
  providers: [
    importProvidersFrom(BrowserModule, FormsModule, BrowserAnimationsModule, ToastrModule.forRoot()),
    provideHttpClient(withInterceptors([authInterceptorFn])),  // Register the interceptor function here
    provideAnimationsAsync(),
    ...(appConfig.providers || [])  // Spread additional providers from appConfig if available
  ]
}).catch(err => console.error(err));
