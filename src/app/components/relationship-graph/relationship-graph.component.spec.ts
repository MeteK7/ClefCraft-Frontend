import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { RelationshipHub, RelationshipType } from '../../models/board.model';
import { BoardService } from '../../_services/board.service';
import { RelationshipGraphComponent } from './relationship-graph.component';
import { MARKER_TIP_OFFSET } from '../../relationship-engine/visualization/edge-router';

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

describe('RelationshipGraphComponent arrowheads and card emphasis', () => {

    let fixture: ComponentFixture<RelationshipGraphComponent>;
    let component: RelationshipGraphComponent;

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
        fixture.detectChanges();
        await nextFrame();
        await nextFrame();
        fixture.detectChanges();
    });

    /** The arrowhead tip of the edge into #2, and #2's card as drawn (transforms included), in graph units. */
    function tipAndTargetCard(): { tip: { x: number; y: number }; card: { left: number; right: number; top: number; bottom: number } } {
        const line = component.renderableEdges()[0];
        const end = line.points[line.points.length - 1];
        const turn = line.points[line.points.length - 2];
        const tipOffset = MARKER_TIP_OFFSET[line.edge.relationType];
        const tip = { x: end.x + Math.sign(end.x - turn.x) * tipOffset, y: end.y + Math.sign(end.y - turn.y) * tipOffset };

        const cardEl = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.node-card'))
            .find(c => c.querySelector('.node-id')!.textContent!.trim() === '#2')!;
        const layer = cardEl.closest('g.graph-layer') as SVGGElement;
        const svg = layer.ownerSVGElement!;
        const inverse = layer.getScreenCTM()!.inverse();
        const toGraph = (x: number, y: number) => {
            const p = svg.createSVGPoint();
            p.x = x;
            p.y = y;
            return p.matrixTransform(inverse);
        };
        const r = cardEl.getBoundingClientRect();
        const a = toGraph(r.left, r.top), b = toGraph(r.right, r.bottom);
        return { tip, card: { left: a.x, right: b.x, top: a.y, bottom: b.y } };
    }

    const covers = (card: { left: number; right: number; top: number; bottom: number }, p: { x: number; y: number }) =>
        p.x >= card.left && p.x <= card.right && p.y >= card.top && p.y <= card.bottom;

    it('keeps the arrowhead tip outside a selected target card', async () => {
        component.selectedNodeId.set(2);
        fixture.detectChanges();
        await new Promise(resolve => setTimeout(resolve, 300)); // the .18s transform transition

        const { tip, card } = tipAndTargetCard();
        expect(covers(card, tip)).withContext(JSON.stringify({ tip, card })).toBeFalse();
    });

    it('keeps the arrowhead tip outside a hovered target card', async () => {
        // :hover can't be triggered from a test; apply the stylesheet's own hover transform instead.
        // (Emulated encapsulation turns the selector into .node-card[_ngcontent-…]:hover.)
        const hoverRule = Array.from(document.styleSheets)
            .flatMap(sheet => { try { return Array.from(sheet.cssRules); } catch { return []; } })
            .find((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule && /^\.node-card(\[[^\]]+\])?:hover$/.test(rule.selectorText))!;
        expect(hoverRule?.style.transform).toBeTruthy();

        const cardEl = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.node-card'))
            .find(c => c.querySelector('.node-id')!.textContent!.trim() === '#2')!;
        cardEl.style.transform = hoverRule.style.transform;
        await new Promise(resolve => setTimeout(resolve, 300));

        const { tip, card } = tipAndTargetCard();
        expect(covers(card, tip)).withContext(JSON.stringify({ tip, card })).toBeFalse();
    });
});

/** On-screen size of one graph unit at the card: the graph layer's screen scale. */
function scaleOf(card: HTMLElement): number {
    const layer = card.closest('g.graph-layer') as SVGGElement;
    const m = layer.getScreenCTM()!;
    return Math.hypot(m.c, m.d);
}
