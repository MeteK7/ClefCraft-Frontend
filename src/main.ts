import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { importProvidersFrom } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ToastrModule } from 'ngx-toastr';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { HTTP_INTERCEPTORS, provideHttpClient } from '@angular/common/http';
import { AuthInterceptor } from './app/_services/auth.interceptor';

//const providers = appConfig.providers || []; // Use empty array if appConfig.providers is undefined

bootstrapApplication(AppComponent, {
  providers: [
    importProvidersFrom(BrowserModule, FormsModule, BrowserAnimationsModule, ToastrModule.forRoot()),
    provideHttpClient(), // Provides the HttpClient globally
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }, // Registers AuthInterceptor to attach JWT token
    provideAnimationsAsync(),
    ...(appConfig.providers || []) // Spread additional providers from appConfig if available
  ]
}).catch(err => console.error(err));
