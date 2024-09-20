import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { importProvidersFrom } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ToastrModule } from 'ngx-toastr';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

//const providers = appConfig.providers || []; // Use empty array if appConfig.providers is undefined

bootstrapApplication(AppComponent, {
  providers: [
    importProvidersFrom(BrowserModule, FormsModule, BrowserAnimationsModule, ToastrModule.forRoot()),
    ...appConfig.providers, provideAnimationsAsync(), provideAnimationsAsync(), // Spread the providers from appConfig
    //...(ToastrModule.forRoot().providers || []) // Spread the providers from ToastrModule.forRoot()
  ]
}).catch(err => console.error(err));
