import { Component, HostBinding } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css']
})
export class SidebarComponent {
  isAdmin: boolean = false;

  constructor() {
    // Replace with actual admin check logic
    this.isAdmin = true; // or false
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