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

describe('RelationshipGraphComponent current-item card', () => {

    let fixture: ComponentFixture<RelationshipGraphComponent>;
    let component: RelationshipGraphComponent;

    const title = 'Write on-call runbook for LLM provider outages';

    const cardFor = (id: number) => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.node-card'))
        .find(c => c.querySelector('.node-id')!.textContent!.trim() === `#${id}`)!;

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
        fixture.componentRef.setInput('rootTitle', title);
        fixture.detectChanges();
    });

    it('labels the center card with the item\'s title, truncated like the other cards, and marks it as current', () => {
        const card = cardFor(1);
        const label = card.querySelector<HTMLElement>('.node-title')!;

        expect(card.textContent).not.toContain('Current Item');
        expect(label.querySelector('[aria-hidden="true"]')!.textContent!.trim()).toBe(component.truncateTitle(title));
        expect(label.querySelector('.visually-hidden')!.textContent!.trim()).toBe(title);
        expect(label.getAttribute('title')).toBe(title);

        expect(card.querySelector('.chip.current')!.textContent!.trim()).toBe('Current');
        expect(card.getAttribute('aria-current')).toBe('true');
    });

    it('does not mark related items as current', () => {
        const card = cardFor(2);

        expect(card.querySelector('.chip.current')).toBeNull();
        expect(card.hasAttribute('aria-current')).toBeFalse();
        expect(card.querySelector('.node-title .visually-hidden')!.textContent!.trim()).toBe('Launch');
    });

    it('relabels the center card on a title change without resetting expansions', () => {
        component.expandedNodeIds.set(new Set([2]));

        fixture.componentRef.setInput('rootTitle', 'Renamed');
        fixture.detectChanges();

        expect(component.nodeAt(1)!.title).toBe('Renamed');
        expect(cardFor(1).querySelector('.node-title .visually-hidden')!.textContent!.trim()).toBe('Renamed');
        expect(component.expandedNodeIds().has(2)).toBeTrue();
    });
});

describe('RelationshipGraphComponent hover impact', () => {

    let fixture: ComponentFixture<RelationshipGraphComponent>;
    let component: RelationshipGraphComponent;

    /** Root #1 depends on #2 and blocks #3, so work waits 2 -> 1 -> 3. */
    const chainHub: RelationshipHub = {
        groups: [
            {
                relationType: RelationshipType.DependsOn,
                name: 'Depends on',
                items: [{ relationId: 20, itemId: 2, boardId: 1, isOutgoing: true, title: 'Schema', status: 'To Do', priority: 'High' }]
            },
            {
                relationType: RelationshipType.Blocks,
                name: 'Blocks',
                items: [{ relationId: 21, itemId: 3, boardId: 1, isOutgoing: true, title: 'Release', status: 'To Do', priority: 'High' }]
            }
        ],
        parentCount: 0,
        blockCount: 1,
        relatedCount: 0,
        dependencyCount: 1
    };

    function create(hubToShow: RelationshipHub, rootStatus = 'To Do'): void {
        fixture = TestBed.createComponent(RelationshipGraphComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('hub', hubToShow);
        fixture.componentRef.setInput('rootItemId', 1);
        fixture.componentRef.setInput('rootStatus', rootStatus);
        fixture.detectChanges();
    }

    function hover(nodeId: number): void {
        component.onNodeEnter(component.nodeAt(nodeId)!, new MouseEvent('mouseenter', { clientX: 10, clientY: 10 }));
        fixture.detectChanges();
    }

    const tooltipText = () =>
        ((fixture.nativeElement as HTMLElement).querySelector('.impact-tooltip')?.textContent ?? '').replace(/\s+/g, ' ');

    const waitingIds = () => component.hoverImpact()!.impactedNodes.map(x => x.node.id).sort((a, b) => a - b);

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [RelationshipGraphComponent],
            providers: [
                provideRouter([]),
                provideNoopAnimations(),
                { provide: BoardService, useValue: { getRelationships: () => of(chainHub) } }
            ]
        }).compileComponents();
    });

    it('analyzes the center card when it is hovered instead of waiting forever', () => {
        create(chainHub);

        hover(1);

        expect(component.hoverImpact()).not.toBeNull();
        expect(waitingIds()).toEqual([3]);
        expect(tooltipText()).not.toContain('Analyzing');
        expect(tooltipText()).toContain('Open items waiting on this: 1');
    });

    it('follows the dependency direction: what the center depends on has the center waiting on it', () => {
        create(chainHub);

        hover(2);

        expect(waitingIds()).toEqual([1, 3]);
        expect(component.hoverImpact()!.maxDepth).toBe(2);
    });

    it('shows no impact for a Done center item', () => {
        create(chainHub, 'Done');

        hover(1);

        expect(component.hoverImpact()!.totalAffected).toBe(0);
        expect(tooltipText()).toContain('Nothing is waiting on this item.');
    });

    it('does not count a Done center item, or what waits through it, when hovering its blocker', () => {
        create(chainHub, 'Done');

        hover(2);

        expect(component.hoverImpact()!.totalAffected).toBe(0);
    });

    it('uses the center item\'s own due date and estimate', () => {
        create(chainHub);
        fixture.componentRef.setInput('rootDueDate', '2026-10-16T00:00:00');
        fixture.componentRef.setInput('rootEstimatedTime', 6);
        fixture.detectChanges();

        hover(2);

        expect(component.hoverImpact()!.earliestDueDate).toEqual(new Date(2026, 9, 16));
        expect(component.hoverImpact()!.estimatedHours).toBe(6);
        expect(component.hoverImpact()!.withoutEstimate).toBe(1);
        expect(tooltipText()).toContain('Estimated hours waiting: 6 hrs');
        expect(tooltipText()).toContain('(1 without an estimate)');
        expect(tooltipText()).toContain('Earliest affected due date: Oct 16');
    });

    it('updates the center item\'s due date and estimate without resetting expansions', () => {
        create(chainHub);
        component.expandedNodeIds.set(new Set([2]));

        fixture.componentRef.setInput('rootDueDate', new Date(2026, 9, 20));
        fixture.componentRef.setInput('rootEstimatedTime', 2);
        fixture.detectChanges();

        expect(component.nodeAt(1)!.dueDate).toEqual(new Date(2026, 9, 20));
        expect(component.nodeAt(1)!.estimatedHours).toBe(2);
        expect(component.expandedNodeIds().has(2)).toBeTrue();
    });

    it('treats the empty-date value the API returns after an edit as no due date', () => {
        create(chainHub);
        fixture.componentRef.setInput('rootDueDate', '0001-01-01T00:00:00');
        fixture.detectChanges();

        expect(component.nodeAt(1)!.dueDate).toBeUndefined();
    });

    it('says "No estimates recorded" instead of "0 hrs" when no waiting item has an estimate', () => {
        create(chainHub);

        hover(2);

        expect(tooltipText()).toContain('Estimated hours waiting: No estimates recorded');
        expect(tooltipText()).not.toContain('0 hrs');
        expect(tooltipText()).not.toContain('without an estimate');
    });

    it('opens the tooltip toward the roomier side of the pointer', () => {
        create(chainHub);
        const container = (fixture.nativeElement as HTMLElement).querySelector('.graph-container')!.getBoundingClientRect();
        const tooltipAt = (fx: number, fy: number) => {
            component.onNodeEnter(component.nodeAt(2)!, new MouseEvent('mouseenter', {
                clientX: container.left + container.width * fx,
                clientY: container.top + container.height * fy
            }));
            fixture.detectChanges();
            return (fixture.nativeElement as HTMLElement).querySelector('.impact-tooltip')!.classList;
        };

        const topLeft = tooltipAt(0.25, 0.25);
        expect(topLeft.contains('open-left')).toBeFalse();
        expect(topLeft.contains('open-up')).toBeFalse();

        const bottomRight = tooltipAt(0.75, 0.75);
        expect(bottomRight.contains('open-left')).toBeTrue();
        expect(bottomRight.contains('open-up')).toBeTrue();
    });

    it('drops the old score from the tooltip', () => {
        create(chainHub);

        hover(2);

        expect(tooltipText()).not.toContain('/100');
        expect(tooltipText()).not.toContain('Story Points');
        expect(tooltipText()).toContain('(in loaded graph)');
        expect(tooltipText()).toContain('Furthest affected item: 2 steps away');
    });
});
