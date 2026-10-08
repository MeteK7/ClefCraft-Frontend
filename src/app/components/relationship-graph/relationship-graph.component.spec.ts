import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { RelationshipHub, RelationshipType } from '../../models/board.model';
import { BoardService } from '../../_services/board.service';
import { RelationshipGraphComponent } from './relationship-graph.component';

/** Root #1 (Critical) blocks #2 (Critical): one critical Blocks edge. */
const hub: RelationshipHub = {
    groups: [{
        relationType: RelationshipType.Blocks,
        name: 'Blocks',
        items: [{ relationId: 10, itemId: 2, boardId: 1, isOutgoing: true, title: 'Launch', status: 'To Do', priority: 'Critical' }]
    }],
    parentCount: 0,
    blockCount: 1,
    relatedCount: 0,
    dependencyCount: 0
};

const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

describe('RelationshipGraphComponent edges', () => {

    let fixture: ComponentFixture<RelationshipGraphComponent>;
    let component: RelationshipGraphComponent;

    const edgePaths = () => (fixture.nativeElement as HTMLElement).querySelectorAll<SVGPathElement>('path.graph-edge');

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [RelationshipGraphComponent],
            providers: [
                provideRouter([]),
                provideNoopAnimations(),
                { provide: BoardService, useValue: { getRelationships: () => of(hub) } }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(RelationshipGraphComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('hub', hub);
        fixture.componentRef.setInput('rootItemId', 1);
        fixture.componentRef.setInput('rootPriority', 'Critical');
    });

    // 14
    it('draws an edge only once both of its cards are measured', () => {
        fixture.detectChanges();

        component.cardHeights.set(new Map([[1, 100]]));
        fixture.detectChanges();
        expect(component.renderableEdges().length).toBe(0);
        expect(edgePaths().length).toBe(0);

        component.onCardSize(2, 124);
        fixture.detectChanges();
        expect(component.renderableEdges().length).toBe(1);
        expect(edgePaths().length).toBe(1);

        component.onCardSize(2, null);
        fixture.detectChanges();
        expect(edgePaths().length).toBe(0);
    });

    it('measures the rendered cards and then draws their edge', async () => {
        fixture.detectChanges();
        expect(edgePaths().length).toBe(0);

        await nextFrame();
        await nextFrame();
        fixture.detectChanges();

        const cards = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.node-card');
        expect(cards.length).toBe(2);
        cards.forEach(card => {
            const id = Number(card.querySelector('.node-id')!.textContent!.trim().slice(1));
            expect(component.cardHeights().get(id)).toBeCloseTo(card.getBoundingClientRect().height / scaleOf(card), 1);
        });
        expect(edgePaths().length).toBe(1);
    });

    // 16
    it('draws a critical Blocks edge at the critical stroke width (4)', () => {
        component.toggleCriticalHighlights();
        fixture.detectChanges();

        component.cardHeights.set(new Map([[1, 100], [2, 124]]));
        fixture.detectChanges();

        const path = edgePaths()[0];
        expect(path.classList).toContain('type-blocks');
        expect(path.classList).toContain('critical');
        expect(getComputedStyle(path).strokeWidth).toBe('4px');
    });
});

/** On-screen size of one graph unit at the card: the graph layer's screen scale. */
function scaleOf(card: HTMLElement): number {
    const layer = card.closest('g.graph-layer') as SVGGElement;
    const m = layer.getScreenCTM()!;
    return Math.hypot(m.c, m.d);
}
