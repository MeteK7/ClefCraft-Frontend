import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../_services/auth.service';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'app-registration',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './registration.component.html',
  styleUrls: ['./registration.component.css']
})
export class RegistrationComponent {
  firstName: string = '';
  lastName: string = '';
  email: string = '';
  userName: string = '';
  password: string = '';
  errorMessage: string = '';

  constructor(private authService: AuthService) {}

  onSubmit(): void {
    this.authService.register(this.firstName, this.lastName, this.email, this.userName, this.password).subscribe(
      response => {
        console.log('Registration successful', response);
        // Handle successful registration, e.g., navigate to login page
      },
      error => {
        console.error('Registration failed', error);
        this.handleErrorResponse(error);
      }
    );
  }

  private handleErrorResponse(error: HttpErrorResponse): void {
    if (error.status === 400 && error.error && error.error.errors) {
      const validationErrors = error.error.errors;
      const errorMessages = Object.keys(validationErrors).map(key => `${key}: ${validationErrors[key].join(' ')}`);
      this.errorMessage = errorMessages.join(' ');
    } else {
      this.errorMessage = 'An unexpected error occurred. Please try again.';
    }
  }
}