import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../_services/auth.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';

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

  constructor(private authService: AuthService, private router: Router, private toastr: ToastrService) {}

  onSubmit(): void {
    this.authService.register(this.firstName, this.lastName, this.email, this.userName, this.password).subscribe(
      response => {
        console.log('Registration successful', response);
        this.toastr.success('Registration successful', 'Success');
        this.router.navigate(['/home']);
      },
      error => {
        console.error('Registration failed', error);
        this.handleErrorResponse(error);
        //You can use the codes below if you want to show errors using Toastr animations.
//      const errorMessage = this.handleErrorResponseToastr(error);
//      this.toastr.error(errorMessage, 'Error');
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

//  private handleErrorResponseToastr(error: HttpErrorResponse): string {
//    let errorMessage = 'An unexpected error occurred. Please try again.';
//    if (error.status === 400 && error.error && error.error.errors) {
//      const validationErrors = error.error.errors;
//      const errorMessages = Object.keys(validationErrors).map(key => `${key}: ${validationErrors[key].join(' ')}`);
//      errorMessage = errorMessages.join(' ');
//    }
//    return errorMessage;
//  }
}