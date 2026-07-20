import {
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Router } from '@angular/router'; // Added Router import

import { RelationshipCard } from '../../models/board.model';

@Component({
  selector: 'app-relationship-card',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule
  ],
  templateUrl: './relationship-card.component.html',
  styleUrls: ['./relationship-card.component.css']
})
export class RelationshipCardComponent {

  @Input()
  relationship!: RelationshipCard;

  @Output()
  open = new EventEmitter<number>();

  @Output()
  delete = new EventEmitter<number>();

  // Inject the router inside the constructor
  constructor(private readonly router: Router) {}

  openItem() {
    this.open.emit(this.relationship.itemId);
  }

  // New method matching the graph view's tab redirect behavior
  openItemInNewTab(event: MouseEvent): void {
    event.stopPropagation(); // Prevents card selection activation or triggering parent clicks
    
    const urlTree = this.router.createUrlTree(['/board'], {
      queryParams: { openItemId: this.relationship.itemId }
    });
    
    window.open(this.router.serializeUrl(urlTree), '_blank');
  }

  remove() {
    this.delete.emit(this.relationship.relationId);
  }
}