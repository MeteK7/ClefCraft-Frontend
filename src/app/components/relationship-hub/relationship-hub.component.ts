import {
    ChangeDetectorRef,
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
    @Input() itemStatus = '';
    @Input() itemPriority = '';

    @Output() openItem = new EventEmitter<number>();
    @Output() graphMaximizedChange = new EventEmitter<boolean>();

    hub: RelationshipHub = {
        parentCount: 0,
        blockCount: 0,
        relatedCount: 0,
        dependencyCount: 0,
        groups: []
    };

    loading = false;
    viewMode: 'list' | 'graph' = 'list';
    readonly RelationshipType = RelationshipType;

    /** Remembered expand/collapse choices for currently-populated relationship types. */
    private expandedState = new Map<RelationshipType, boolean>();

    constructor(
        private boardService: BoardService,
        private dialog: MatDialog,
        private cdr: ChangeDetectorRef
    ) { }

    ngOnInit(): void {
        this.loadRelationships();
    }

    loadRelationships(): void {
        this.loading = true;
        this.cdr.detectChanges();

        this.boardService
            .getRelationships(this.itemId)
            .subscribe({
                next: hub => {
                    const populated = hub.groups.filter(g => g.items.length > 0);
                    const populatedTypes = new Set(populated.map(g => g.relationType));

                    for (const type of Array.from(this.expandedState.keys())) {
                        if (!populatedTypes.has(type)) this.expandedState.delete(type);
                    }

                    const defaultExpanded = populated.length <= 2;

                    for (const group of populated) {
                        group.expanded = this.expandedState.has(group.relationType)
                            ? this.expandedState.get(group.relationType)!
                            : defaultExpanded;
                        this.expandedState.set(group.relationType, group.expanded);
                    }

                    hub.groups = populated;
                    this.hub = hub;
                    this.loading = false;
                    this.cdr.detectChanges();
                },
                error: () => {
                    this.loading = false;
                    this.cdr.detectChanges();
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

    onGroupExpandedChange(group: RelationshipGroup, expanded: boolean): void {
        group.expanded = expanded;
        this.expandedState.set(group.relationType, expanded);
    }
}