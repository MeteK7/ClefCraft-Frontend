import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
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
        // No native title tooltip: the node tooltip already shows the full title.
        expect(label.hasAttribute('title')).toBeFalse();

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
        // A fixed graph area, so positions measured from the DOM are deterministic.
        const host = fixture.nativeElement as HTMLElement;
        host.style.width = '1000px';
        host.style.height = '600px';
        fixture.componentRef.setInput('hub', hubToShow);
        fixture.componentRef.setInput('rootItemId', 1);
        fixture.componentRef.setInput('rootStatus', rootStatus);
        fixture.detectChanges();
    }

    /**
     * chainHub with the center ("Release v2") and #3 due the same day, so hovering #2 names
     * "#1 Release v2 + 1 more" for the earliest deadline at risk.
     */
    function createSameDay(): void {
        create({
            ...chainHub,
            groups: chainHub.groups.map(g => ({
                ...g,
                items: g.items.map(item => item.itemId === 3 ? { ...item, dueDate: '2026-10-16T15:00:00' as unknown as Date } : item)
            }))
        });
        fixture.componentRef.setInput('rootTitle', 'Release v2');
        fixture.componentRef.setInput('rootDueDate', '2026-10-16T00:00:00');
        fixture.detectChanges();
    }

    function hover(nodeId: number): void {
        component.onNodeEnter(component.nodeAt(nodeId)!);
        fixture.detectChanges();
    }

    /** Lets rendering, card and tooltip measurement (ResizeObserver) and placement settle. */
    async function settle(): Promise<void> {
        fixture.detectChanges();
        await fixture.whenStable();
        await nextFrame();
        await nextFrame();
        fixture.detectChanges();
    }

    /**
     * Zoom buttons animate the graph layer (a .5s CSS transition), and headless Chrome may not finish
     * it on time. Dropping the animation, as the component does for wheel and pan, puts the cards at
     * their final position at once, where the tooltip placement already is.
     */
    async function endViewportTransition(): Promise<void> {
        component.viewportAnimated.set(false);
        await settle();
    }

    const rectOf = (el: Element) => el.getBoundingClientRect();
    const overlaps = (a: DOMRect, b: DOMRect) =>
        Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
    /** Distance between two rects that don't overlap, along the axis that separates them. */
    const gapBetween = (a: DOMRect, b: DOMRect) =>
        Math.max(b.left - a.right, a.left - b.right, b.top - a.bottom, a.top - b.bottom);

    const tooltipEl = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.impact-tooltip')!;
    const cardEl = (id: number) => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.node-card'))
        .find(c => c.querySelector('.node-id')!.textContent!.trim() === `#${id}`)!;

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
        fixture.componentRef.setInput('rootTitle', 'Release v2');
        fixture.componentRef.setInput('rootDueDate', '2026-10-16T00:00:00');
        fixture.componentRef.setInput('rootEstimatedTime', 6);
        fixture.detectChanges();

        hover(2);

        expect(component.hoverImpact()!.earliestDueDate).toEqual(new Date(2026, 9, 16));
        expect(component.hoverImpact()!.estimatedHours).toBe(6);
        expect(component.hoverImpact()!.withoutEstimate).toBe(1);
        expect(tooltipText()).toContain('Estimated hours waiting: 6 hrs');
        expect(tooltipText()).toContain('(1 without an estimate)');
        // The date, and the item it belongs to.
        expect(tooltipText()).toContain('Earliest deadline at risk: Oct 16 (#1 Release v2)');
    });

    it('names the nearest item due that day and counts the others due the same day', () => {
        createSameDay();

        hover(2);

        expect(component.hoverImpact()!.earliestDueItems.map(n => n.id)).toEqual([1, 3]);
        expect(tooltipText()).toContain('Earliest deadline at risk: Oct 16 (#1 Release v2 + 1 more)');
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

    it('places the tooltip beside the hovered card, inside the graph area, without covering other cards', async () => {
        // #2 sits in the row under the root, next to #3. The fitted view puts that row at the bottom
        // edge; zoomed out, there is free space below it.
        create(chainHub);
        await settle();
        component.zoomOut();
        await endViewportTransition();

        hover(2);
        await settle();

        const tooltip = rectOf(tooltipEl());
        const container = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.graph-container')!;
        const svg = rectOf((fixture.nativeElement as HTMLElement).querySelector('svg.graph-svg')!);
        const visible = {
            left: Math.max(svg.left, rectOf(container).left),
            right: Math.min(svg.right, rectOf(container).right),
            top: Math.max(svg.top, rectOf(container).top),
            bottom: Math.min(svg.bottom, rectOf(container).bottom)
        };

        expect(getComputedStyle(tooltipEl()).visibility).toBe('visible');
        expect(tooltip.left).toBeGreaterThanOrEqual(visible.left);
        expect(tooltip.right).toBeLessThanOrEqual(visible.right);
        expect(tooltip.top).toBeGreaterThanOrEqual(visible.top);
        expect(tooltip.bottom).toBeLessThanOrEqual(visible.bottom);

        for (const id of [1, 2, 3]) {
            expect(overlaps(tooltip, rectOf(cardEl(id)))).withContext(`covers card #${id}`).toBeFalse();
        }
        expect(gapBetween(tooltip, rectOf(cardEl(2)))).toBeCloseTo(12, 0);
    });

    it('moves the tooltip with the card when the graph is zoomed while hovering', async () => {
        create(chainHub);
        await settle();
        hover(2);
        await settle();

        const tooltipBefore = rectOf(tooltipEl());
        const cardBefore = rectOf(cardEl(2));

        component.zoomIn();
        await endViewportTransition();

        const tooltipAfter = rectOf(tooltipEl());
        const cardAfter = rectOf(cardEl(2));

        expect(cardAfter.left).not.toBeCloseTo(cardBefore.left, 0);
        expect(tooltipAfter.left).not.toBeCloseTo(tooltipBefore.left, 0);
        expect(overlaps(tooltipAfter, cardAfter)).toBeFalse();
        expect(gapBetween(tooltipAfter, cardAfter)).toBeCloseTo(12, 0);
    });

    it('drops the old score from the tooltip', () => {
        create(chainHub);

        hover(2);

        expect(tooltipText()).not.toContain('/100');
        expect(tooltipText()).not.toContain('Story Points');
        expect(tooltipText()).toContain('(in loaded graph)');
        // #3 waits on #2 through the center: the distance, and which item is that far away.
        expect(tooltipText()).toContain('Furthest affected item: 2 steps away (#3 Release)');
    });

    describe('clicking in the tooltip', () => {

        const tooltipShown = () => !!(fixture.nativeElement as HTMLElement).querySelector('.impact-tooltip');
        const dueRow = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.impact-due')!;
        const moreButton = () => dueRow().querySelector<HTMLButtonElement>('.impact-more')!;
        const listedNames = () => Array.from(dueRow().querySelectorAll<HTMLButtonElement>('.impact-list .impact-item'))
            .map(b => b.textContent!.trim());

        it('stays open while the pointer crosses from the card onto the tooltip', fakeAsync(() => {
            create(chainHub);
            hover(2);

            component.onNodeLeave();
            tick(100);
            component.onTooltipEnter();
            tick(1000);
            fixture.detectChanges();

            expect(component.hoveredNodeId()).toBe(2);
            expect(tooltipShown()).toBeTrue();
        }));

        it('closes a moment after the pointer leaves the card, or the tooltip, for good', fakeAsync(() => {
            create(chainHub);
            hover(2);

            component.onNodeLeave();
            tick(150);
            expect(component.hoveredNodeId()).toBe(2);
            tick(100);
            fixture.detectChanges();
            expect(tooltipShown()).toBeFalse();

            hover(2);
            component.onTooltipLeave();
            tick(250);
            fixture.detectChanges();
            expect(tooltipShown()).toBeFalse();
        }));

        it('keeps an open list when the pointer goes back from the tooltip to the card', fakeAsync(() => {
            createSameDay();
            hover(2);
            moreButton().click();
            fixture.detectChanges();

            component.onTooltipLeave();
            tick(50);
            hover(2);
            tick(500);
            fixture.detectChanges();

            expect(listedNames().length).toBe(2);
        }));

        it('lists every item behind "+ N more", and folds the list away again', () => {
            createSameDay();
            hover(2);

            expect(moreButton().textContent!.trim()).toBe('+ 1 more');
            expect(moreButton().getAttribute('aria-expanded')).toBe('false');

            moreButton().click();
            fixture.detectChanges();

            expect(moreButton().getAttribute('aria-expanded')).toBe('true');
            expect(moreButton().textContent!.trim()).toBe('less');
            expect(listedNames()).toEqual(['#1 Release v2', '#3 Release']);

            moreButton().click();
            fixture.detectChanges();

            expect(listedNames()).toEqual([]);
        });

        it('has no "+ N more" button when a row names a single item', () => {
            create(chainHub);
            hover(2);

            const furthestRow = (fixture.nativeElement as HTMLElement).querySelector('.impact-depth')!;
            expect(furthestRow.querySelector('.impact-more')).toBeNull();
        });

        it('selects a listed item, brings it into view and closes the tooltip', () => {
            createSameDay();
            hover(2);
            moreButton().click();
            fixture.detectChanges();
            const viewportBefore = component.viewport();

            dueRow().querySelectorAll<HTMLButtonElement>('.impact-item')[1].click(); // #3 Release
            fixture.detectChanges();

            expect(component.selectedNodeId()).toBe(3);
            expect(component.viewport()).not.toEqual(viewportBefore);
            expect(tooltipShown()).toBeFalse();
        });

        describe('after a listed item is clicked', () => {

            /** Clicks the listed #3 with the mouse at (x, y), or from the keyboard (detail 0). */
            function clickListedItem(click: MouseEventInit): void {
                createSameDay();
                hover(2);
                moreButton().click();
                fixture.detectChanges();
                dueRow().querySelectorAll<HTMLButtonElement>('.impact-item')[1]
                    .dispatchEvent(new MouseEvent('click', { bubbles: true, ...click }));
                fixture.detectChanges();
            }

            const moveMouseTo = (x: number, y: number) =>
                document.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));

            // A card the view slid under the resting pointer gets a "mouseenter" with no mouse movement.
            const cardSlidesUnderPointer = (id: number) => {
                component.onNodeEnter(component.nodeAt(id)!);
                fixture.detectChanges();
            };

            it('does not open a tooltip for a card that slides under the resting pointer', () => {
                clickListedItem({ clientX: 300, clientY: 200, detail: 1 });

                cardSlidesUnderPointer(1);

                expect(component.hoveredNodeId()).toBeNull();
                expect(tooltipShown()).toBeFalse();
            });

            it('keeps ignoring it while the pointer only reports the position it was clicked at', () => {
                clickListedItem({ clientX: 300, clientY: 200, detail: 1 });

                moveMouseTo(300, 200);
                cardSlidesUnderPointer(1);

                expect(tooltipShown()).toBeFalse();
            });

            it('opens tooltips again once the mouse has really moved and a card is entered', () => {
                clickListedItem({ clientX: 300, clientY: 200, detail: 1 });

                moveMouseTo(301, 200);
                cardSlidesUnderPointer(1);

                expect(component.hoveredNodeId()).toBe(1);
                expect(tooltipShown()).toBeTrue();
            });

            it('waits for any mouse movement after a keyboard click, which has no pointer position', () => {
                clickListedItem({ detail: 0 });

                cardSlidesUnderPointer(1);
                expect(tooltipShown()).toBeFalse();

                moveMouseTo(10, 10);
                cardSlidesUnderPointer(1);
                expect(tooltipShown()).toBeTrue();
            });

            it('stops listening for mouse movement when the graph is destroyed', () => {
                clickListedItem({ clientX: 300, clientY: 200, detail: 1 });
                const removeListener = spyOn(document, 'removeEventListener').and.callThrough();

                fixture.destroy();

                expect(removeListener).toHaveBeenCalledWith('mousemove', jasmine.any(Function), true);
            });
        });

        it('closes at once when the graph closes it (for example when its card is collapsed away)', () => {
            create(chainHub);
            hover(2);

            component.closeTooltip();
            fixture.detectChanges();

            expect(component.hoveredNodeId()).toBeNull();
            expect(tooltipShown()).toBeFalse();
        });
    });
});
