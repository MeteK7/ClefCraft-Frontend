import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BoardService } from '../../_services/board.service';
import { Item, Column } from '../../models/board.model';

@Component({
  selector: 'app-add-item-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './add-item-form.component.html',
  styleUrls: ['./add-item-form.component.css']
})
export class AddItemFormComponent {
  @Output() itemCreated = new EventEmitter<Item>();
  title = '';
  description = '';
  boardColumnId = 1; // Default column ID
  columns: Column[] = [];

  constructor(private boardService: BoardService) {}

  ngOnInit(): void {
    this.boardService.getBoardColumns().subscribe(columns => {
      this.columns = columns;
    });
  }

  createItem(): void {
    const newItem = { title: this.title, description: this.description, boardColumnId: this.boardColumnId };
    this.boardService.createBoardItem(newItem).subscribe(item => {
      this.itemCreated.emit(item);
    });
  }
}
