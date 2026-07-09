import {
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

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

  openItem() {
    this.open.emit(this.relationship.itemId);
  }

  remove() {
    this.delete.emit(this.relationship.relationId);
  }

}