import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { LoginComponent } from './components/login/login.component';
import { RegistrationComponent } from './components/registration/registration.component';
import { CalendarComponent } from './pages/calendar/calendar.component';
import { EventTrackerComponent } from './pages/event-tracker/event-tracker.component';
import { BoardComponent } from './pages/board/board.component';
import { KanbanBoardComponent } from './pages/kanban-board/kanban-board.component';
import { PlayalongComponent } from './pages/playalong/playalong.component';
import { MetronomeComponent } from './pages/metronome/metronome.component';
import { TunerComponent } from './pages/tuner/tuner.component';
import { ManagementComponent } from './pages/management/management.component';

export const routes: Routes = [
  { path: '', redirectTo: '/home', pathMatch: 'full' },
  { path: 'home', component: HomeComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegistrationComponent },
  { path: 'calendar', component: CalendarComponent },
  { path: 'event-tracker', component: EventTrackerComponent },
  { path: 'board', component: BoardComponent },
  { path: 'kanbanboard', component: KanbanBoardComponent },
  { path: 'playalong', component: PlayalongComponent },
  { path: 'metronome', component: MetronomeComponent },
  { path: 'tuner', component: TunerComponent },
  { path: 'management', component: ManagementComponent }
];