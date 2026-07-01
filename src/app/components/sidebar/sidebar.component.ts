import { Component, HostBinding } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../_services/auth.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css']
})
export class SidebarComponent {
  isAdmin: boolean = false;
  userFullName: string = '';

  constructor(private authService: AuthService) {
    // Replace with actual admin check logic
    this.isAdmin = true; // or false
  }

  ngOnInit() {
    this.authService.currentUser$.subscribe(user => {
      this.userFullName = user?.fullName ?? '';
    });
  }

  isCollapsed = false;

  @HostBinding('class.collapsed')
  get collapsedClass() {
    return this.isCollapsed;
  }

  toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;
  }
}