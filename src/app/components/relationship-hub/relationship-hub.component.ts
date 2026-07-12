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

import {
    RelationshipType
} from '../../models/board.model';
import { RelationshipDialogComponent } from '../relationship-dialog/relationship-dialog.component';
import { RelationshipGraphComponent } from '../relationship-graph/relationship-graph.component';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-relationship-hub',
    standalone: true,
    imports: [
        FormsModule,
        CommonModule,
        MatButtonModule,
        MatIconModule,
        MatExpansionModule,
        MatButtonToggleModule,
        RelationshipCardComponent,
        RelationshipGraphComponent
    ],
    templateUrl: './relationship-hub.component.html',
    styleUrls: ['./relationship-hub.component.css']
})
export class RelationshipHubComponent implements OnInit {

    @Input() boardId!: number;
    @Input() itemId!: number;

    @Output() openItem = new EventEmitter<number>();

    hub: RelationshipHub = {
        parentCount: 0,
        blockCount: 0,
        relatedCount: 0,
        dependencyCount: 0,
        groups: []
    };

    loading = false;
    viewMode: 'list' | 'graph' = 'graph';
    readonly RelationshipType = RelationshipType;

    constructor(
        private boardService: BoardService,
        private dialog: MatDialog
    ) { }

    ngOnInit(): void {
        this.loadRelationships();
    }

    loadRelationships(): void {

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

    addRelationship(): void {

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

                if (created) {
                    this.loadRelationships();
                }

            });

    }

    deleteRelationship(relationId: number): void {

        this.boardService
            .deleteRelationship(relationId)
            .subscribe(() => this.loadRelationships());

    }

    open(itemId: number): void {

        this.openItem.emit(itemId);

    }

    trackGroup(index: number, group: RelationshipGroup): number {

        return group.relationType;

    }

}