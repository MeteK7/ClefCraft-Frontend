import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { LoginComponent } from './components/login/login.component';
import { RegistrationComponent } from './components/registration/registration.component';
import { CalendarComponent } from './pages/calendar/calendar.component';
import { EventTrackerComponent } from './pages/event-tracker/event-tracker.component';
import { BoardComponent } from './pages/board/board.component';
import { PlayalongComponent } from './pages/playalong/playalong.component';
import { MetronomeComponent } from './pages/metronome/metronome.component';
import { TunerComponent } from './pages/tuner/tuner.component';
import { ManagementComponent } from './pages/management/management.component';
import { authGuard } from './guards/auth.guard';
import { ProtectedWorkspaceComponent } from './pages/protected-workspace/protected-workspace.component';

export const routes: Routes = [

  { path: '', redirectTo: '/login', pathMatch: 'full' },

  { path: 'home', component: HomeComponent },

  { path: 'login', component: LoginComponent },

  { path: 'registration', component: RegistrationComponent },

  {
    path: 'calendar',
    component: CalendarComponent,
    canActivate: [authGuard]
  },

  {
    path: 'event-tracker',
    component: EventTrackerComponent,
    canActivate: [authGuard]
  },

  {
    path: 'board',
    component: BoardComponent,
    canActivate: [authGuard]
  },

  {
    path: 'management',
    component: ManagementComponent,
    canActivate: [authGuard]
  },

  {
    path: 'playalong',
    component: PlayalongComponent,
    canActivate: [authGuard]
  },

  {
    path: 'metronome',
    component: MetronomeComponent,
    canActivate: [authGuard]
  },

  {
    path: 'tuner',
    component: TunerComponent,
    canActivate: [authGuard]
  },

  {
    path: 'protected',
    component: ProtectedWorkspaceComponent
  }

];