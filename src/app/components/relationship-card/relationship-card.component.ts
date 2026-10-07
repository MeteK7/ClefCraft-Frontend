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

import { RelationshipCard, RelationshipType, relationshipLabel } from '../../models/board.model';

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

  @Input()
  relationType?: RelationshipType;

  @Output()
  open = new EventEmitter<number>();

  @Output()
  delete = new EventEmitter<number>();

  // Inject the router inside the constructor
  constructor(private readonly router: Router) {}

  /** How the relation reads from the open item, e.g. "Blocks" or "Blocked by". */
  get directionLabel(): string {
    return this.relationType == null ? '' : relationshipLabel(this.relationType, this.relationship.isOutgoing);
  }

  openItem() {
    this.open.emit(this.relationship.itemId);
  }

  // New method matching the graph view's tab redirect behavior
  openItemInNewTab(event: MouseEvent): void {
    event.stopPropagation(); // Prevents card selection activation or triggering parent clicks

    // Without boardId the board page opens the first board and can't find the item.
    const urlTree = this.router.createUrlTree(['/board'], {
      queryParams: { openItemId: this.relationship.itemId, boardId: this.relationship.boardId }
    });
    
    window.open(this.router.serializeUrl(urlTree), '_blank');
  }

  remove() {
    this.delete.emit(this.relationship.relationId);
  }
}