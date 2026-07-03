import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-protected-workspace',
  standalone: true,
  templateUrl: './protected-workspace.component.html',
  styleUrls: ['./protected-workspace.component.css']
})
export class ProtectedWorkspaceComponent {

  returnUrl = '/home';

  constructor(
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.returnUrl =
      this.route.snapshot.queryParamMap.get('returnUrl') ?? '/home';
  }

  login(): void {
    this.router.navigate(
      ['/login'],
      {
        queryParams: {
          returnUrl: this.returnUrl
        }
      }
    );
  }

  goHome(): void {
    this.router.navigate(['/home']);
  }

}