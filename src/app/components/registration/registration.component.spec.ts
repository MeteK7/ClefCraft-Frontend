import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';

import { RegistrationComponent } from './registration.component';
import { AuthService } from '../../_services/auth.service';

describe('RegistrationComponent', () => {
  let component: RegistrationComponent;
  let fixture: ComponentFixture<RegistrationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegistrationComponent],
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: MatSnackBar, useValue: jasmine.createSpyObj('MatSnackBar', ['open']) },
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RegistrationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('on submit', () => {
    let snackBar: jasmine.SpyObj<MatSnackBar>;

    beforeEach(() => {
      snackBar = TestBed.inject(MatSnackBar) as jasmine.SpyObj<MatSnackBar>;
      spyOn(console, 'error');
    });

    it('confirms the registration and sends the user to sign in', () => {
      spyOn(TestBed.inject(AuthService), 'register').and.returnValue(of({}));
      const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);

      component.onSubmit();

      expect(component.isLoading).toBeFalse();
      expect(snackBar.open).toHaveBeenCalledWith('Registration successful', 'Dismiss', { duration: 5000 });
      expect(navigate).toHaveBeenCalledWith(['/login']);
    });

    it('shows the validation errors the API returns (400)', () => {
      const error = new HttpErrorResponse({
        status: 400,
        error: { errors: { Password: ['Too short.', 'Needs a digit.'], Email: ['Already taken.'] } }
      });
      spyOn(TestBed.inject(AuthService), 'register').and.returnValue(throwError(() => error));

      component.onSubmit();

      expect(component.isLoading).toBeFalse();
      expect(snackBar.open).toHaveBeenCalledWith(
        'Password: Too short. Needs a digit. Email: Already taken.', 'Dismiss', { duration: 5000 });
    });

    it('shows a generic message for any other failure', () => {
      spyOn(TestBed.inject(AuthService), 'register')
        .and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));

      component.onSubmit();

      expect(snackBar.open).toHaveBeenCalledWith(
        'An unexpected error occurred. Please try again.', 'Dismiss', { duration: 5000 });
    });
  });
});
