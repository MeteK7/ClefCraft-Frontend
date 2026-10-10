import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
    selector: 'app-user-avatar',
    imports: [MatTooltipModule],
    templateUrl: './user-avatar.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './user-avatar.component.css'
})
export class UserAvatarComponent {
  @Input() fullName = '';

  get initials(): string {
    const parts = this.fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
}
