import {
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output
} from '@angular/core';

import { CommonModule } from '@angular/common';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDialog } from '@angular/material/dialog';

import {
  RelationshipHub,
  RelationshipGroup
} from '../../models/board.model';

import { BoardService } from '../../_services/board.service';
import { RelationshipCardComponent } from '../relationship-card/relationship-card.component';
import { RelationshipDialogComponent } from '../relationship-dialog/relationship-dialog.component';

@Component({
    selector: 'app-relationship-hub',
    standalone: true,
    imports: [
        CommonModule,
        MatButtonModule,
        MatIconModule,
        MatExpansionModule,
        RelationshipCardComponent
    ],
    templateUrl: './relationship-hub.component.html',
    styleUrls: ['./relationship-hub.component.css']
})
export class RelationshipHubComponent implements OnInit {

    @Input()
    boardId!: number;

    @Input()
    itemId!: number;

    @Output()
    openItem = new EventEmitter<number>();

    hub?: RelationshipHub;

    loading = false;

    constructor(
        private boardService: BoardService,
        private dialog: MatDialog
    ) {}

    ngOnInit(): void {

        this.loadRelationships();

    }

    loadRelationships() {

        this.loading = true;

        this.boardService
            .getRelationships(this.itemId)
            .subscribe({

                next: hub => {

                    this.hub = hub;
                    this.loading = false;

                },

                error: () => {

                    this.loading = false;

                }

            });

    }

    addRelationship() {

        const dialogRef = this.dialog.open(
            RelationshipDialogComponent,
            {

                width: '700px',

                data: {

                    boardId: this.boardId,
                    itemId: this.itemId

                }

            });

        dialogRef.afterClosed()
            .subscribe(created => {

                if(created){

                    this.loadRelationships();

                }

            });

    }

    deleteRelationship(relationId:number){

        this.boardService
            .deleteRelationship(relationId)
            .subscribe(() => {

                this.loadRelationships();

            });

    }

    open(itemId:number){

        this.openItem.emit(itemId);

    }

    trackGroup(index:number, group:RelationshipGroup){

        return group.relationType;

    }

}