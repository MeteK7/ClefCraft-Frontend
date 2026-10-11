import { Component, ChangeDetectionStrategy } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../_services/auth.service';
import { HttpErrorResponse } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
    selector: 'app-registration',
    imports: [FormsModule, RouterModule],
    templateUrl: './registration.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrls: ['./registration.component.css']
})
export class RegistrationComponent {

  firstName = '';
  lastName = '';
  email = '';
  userName = '';
  password = '';

  errorMessage = '';
  isLoading = false;
  showPassword = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  onSubmit(): void {

    this.isLoading = true;

    this.authService.register(
      this.firstName,
      this.lastName,
      this.email,
      this.userName,
      this.password
    ).subscribe({
      next: () => {

        this.isLoading = false;

        this.snackBar.open('Registration successful', 'Dismiss', { duration: 5000 });

        // Registration doesn't sign the user in; /home requires a session.
        this.router.navigate(['/login']);
      },

      error: (error) => {

        this.isLoading = false;

        console.error('Registration failed', error);

        this.handleErrorResponse(error);

        this.snackBar.open(this.errorMessage, 'Dismiss', { duration: 5000 });
      }
    });
  }

  private handleErrorResponse(error: HttpErrorResponse): void {

    if (error.status === 400 && error.error?.errors) {

      const validationErrors = error.error.errors;

      const errorMessages = Object.keys(validationErrors)
        .map(key => `${key}: ${validationErrors[key].join(' ')}`);

      this.errorMessage = errorMessages.join(' ');

    } else if (error.status === 400 && typeof error.error?.title === 'string' && error.error.title.trim()) {

      // Identity's rejections (password rules, a taken user name) arrive as a "•"-bulleted
      // list in the problem title, with no field errors.
      this.errorMessage = error.error.title
        .split('\n')
        .map((line: string) => line.replace(/^•/, '').trim())
        .filter((line: string) => line.length > 0)
        .join(' ');

    } else {

      this.errorMessage = 'An unexpected error occurred. Please try again.';
    }
  }
}