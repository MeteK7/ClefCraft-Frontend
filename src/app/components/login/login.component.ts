import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../_services/auth.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  isLoading = false;
  showPassword = false;

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private toastr: ToastrService
  ) { }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  submit(): void {
    if (this.form.invalid) return;

    this.isLoading = true;

    const { email, password } = this.form.value;

    this.authService.login(email!, password!).subscribe({
      next: res => {
        this.authService.setToken(res.token);

        this.authService.loadCurrentUser().subscribe({
          next: user => {
            this.authService.setCurrentUser(user);
            this.router.navigate(['/home']);
          }
        });
      },
      error: () => {
        this.isLoading = false;
        this.toastr.error('Invalid email or password', 'Login failed');
      }
    });
  }
}