import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Item } from '../../models/board.model';
import { CommonModule } from '@angular/common';
import { DragDropModule } from '@angular/cdk/drag-drop';

@Component({
  selector: 'app-board-item',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  templateUrl: './board-item.component.html',
  styleUrls: ['./board-item.component.css']
})
export class BoardItemComponent {
  @Input() item!: Item;
  @Output() itemClickedEvent = new EventEmitter<Item>();

  onItemClicked() {
    this.itemClickedEvent.emit(this.item);
  }
}
