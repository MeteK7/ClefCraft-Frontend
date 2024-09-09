import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BoardColumnComponent } from '../board-column/board-column.component';
import { Column, Item } from '../../models/board.model';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { BoardService } from '../../_services/board.service';
import { AddItemFormComponent } from '../../components/add-item-form/add-item-form.component';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [CommonModule, BoardColumnComponent, DragDropModule, AddItemFormComponent],
  templateUrl: './board.component.html',
  styleUrls: ['./board.component.css']
})
export class BoardComponent implements OnInit {
  columns: Column[] = [];
  items: Item[] = [];

  constructor(private boardService: BoardService) {}

  ngOnInit(): void {
    this.loadBoardColumns();
    //this.loadBoardItems();
  }
  loadBoardColumns(): void {
    this.boardService.getBoardColumns().subscribe(columns => {
      this.columns = columns.map(column => ({
        ...column,
        items: column.boardItems // ensure items are assigned from response
      }));
    });
  }

  get allColumnIds(): string[] {
    return this.columns.map(column => 'column-' + column.title);
  }

  onItemCreated(item: Item): void {
    const column = this.columns.find(c => c.id === item.id);
    if (column) {
      column.boardItems.push(item);
    }
  }
}