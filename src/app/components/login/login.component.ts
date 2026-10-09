import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../_services/auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
    selector: 'app-login',
    imports: [CommonModule, ReactiveFormsModule, RouterModule],
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {
  isLoading = false;
  showPassword = false;
  /** Why the user landed here without logging out themselves (inactivity or expired session). */
  signOutNotice: string | null = null;

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private snackBar: MatSnackBar
  ) { }

  ngOnInit(): void {
    const reason = this.route.snapshot.queryParamMap.get('reason');

    if (reason === 'idle') {
      this.signOutNotice = 'You were signed out after 15 minutes of inactivity.';
    } else if (reason === 'expired') {
      this.signOutNotice = 'Your session has expired. Please sign in again.';
    }
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  submit(): void {
    if (this.form.invalid) return;

    this.isLoading = true;

    const { email, password } = this.form.value;

    this.authService.login(email!, password!).subscribe({
      next: res => {
        this.authService.setSession(res);

        this.authService.loadCurrentUser().subscribe({
          next: user => {
            this.authService.setCurrentUser(user);
            this.router.navigateByUrl(this.returnUrl());
          }
        });
      },
      error: (err: HttpErrorResponse) => {
        this.isLoading = false;

        if (err.status === 429) {
          this.snackBar.open('Too many sign-in attempts. Please wait a minute and try again.', 'Dismiss', { duration: 5000 });
          return;
        }

        // Deliberately one message for every failure: the API doesn't say whether the email
        // exists or the account is locked, and neither should the UI.
        this.snackBar.open('Invalid email or password, or the account is temporarily locked.', 'Dismiss', { duration: 5000 });
      }
    });
  }

  /** Where the user was headed before being sent to log in — only ever an in-app path. */
  private returnUrl(): string {
    const url = this.route.snapshot.queryParamMap.get('returnUrl');
    const isInternalPath = !!url && url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\');

    return url && isInternalPath && !url.startsWith('/login') ? url : '/calendar';
  }
}
