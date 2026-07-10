import {
    Component,
    Inject
} from '@angular/core';

import {
    FormBuilder,
    ReactiveFormsModule,
    Validators
} from '@angular/forms';

import { CommonModule } from '@angular/common';

import {
    MAT_DIALOG_DATA,
    MatDialogModule,
    MatDialogRef
} from '@angular/material/dialog';

import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import {
    debounceTime,
    distinctUntilChanged
} from 'rxjs/operators';

import {
    BoardItemSearchResult,
    CreateRelationshipRequest,
    RELATIONSHIP_TYPES,
    RelationshipType
} from '../../models/board.model';

import { BoardService } from '../../_services/board.service';

@Component({
    selector: 'app-relationship-dialog',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        MatDialogModule,
        MatFormFieldModule,
        MatInputModule,
        MatSelectModule,
        MatButtonModule,
        MatIconModule
    ],
    templateUrl: './relationship-dialog.component.html',
    styleUrls: ['./relationship-dialog.component.css']
})
export class RelationshipDialogComponent {

    candidates: BoardItemSearchResult[] = [];
    searching = false;
    submitting = false;

    form = this.fb.group({

        relationType: [
            RelationshipType.Related,
            Validators.required
        ],

        targetItemId: [
            null as number | null,
            Validators.required
        ],

        search: ['']

    });

    readonly relationshipTypes = RELATIONSHIP_TYPES;

    constructor(

        private fb: FormBuilder,

        private boardService: BoardService,

        private dialogRef: MatDialogRef<RelationshipDialogComponent>,

        @Inject(MAT_DIALOG_DATA)
        public data: any

    ) {

        this.form.controls.search.valueChanges
            .pipe(

                debounceTime(300),

                distinctUntilChanged()

            )
            .subscribe(value => {

                this.search(value ?? '');

            });

    }

    search(term: string) {

        if (term.length < 2) {

            this.candidates = [];

            return;

        }

        this.searching = true;

        this.boardService
            .searchRelationshipCandidates(
                this.data.boardId,
                this.data.itemId,
                term)
            .subscribe({

                next: r => {

                    this.candidates = r;

                    this.searching = false;

                },

                error: () => {

                    this.searching = false;

                }

            });

    }

    create() {
        if (this.form.invalid || this.submitting) return;
        this.submitting = true;

        const request: CreateRelationshipRequest = {

            sourceBoardItemId: this.data.itemId,
            targetBoardItemId: this.form.value.targetItemId!,
            relationType: this.form.get('relationType')!.value!

        };

        this.boardService.createRelationship(request).subscribe({
            next: () => this.dialogRef.close(true),
            error: () => { this.submitting = false; }
        });
    }

    cancel() {

        this.dialogRef.close(false);

    }

}