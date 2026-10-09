import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    EventEmitter,
    HostBinding,
    HostListener,
    Input,
    OnChanges,
    Output,
    SimpleChanges,
    computed,
    signal,
    viewChild
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';

import { firstValueFrom, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { RelationshipHub, RelationshipType } from '../../models/board.model';
import { BoardService } from '../../_services/board.service';

import { RelationshipGraphBuilder } from '../../relationship-engine/graph/relationship-graph-builder';
import { GraphLayoutEngine } from '../../relationship-engine/graph/graph-layout-engine';
import { GraphExpansionTracker } from '../../relationship-engine/graph/graph-expansion-tracker';

import { CycleDetector, RelationshipCycle } from '../../relationship-engine/analytics/cycle-detector';
import { ImpactEngine, ImpactAnalysis } from '../../relationship-engine/analytics/impact-engine';

import { GraphNode } from '../../relationship-engine/visualization/graph-node.model';
import { GraphEdge } from '../../relationship-engine/visualization/graph-edge.model';
import { GraphViewModel, rebuildIndex } from '../../relationship-engine/visualization/graph-view-model';
import { Point, RouteCard, cardRect, routeEdge } from '../../relationship-engine/visualization/edge-router';
import { GraphCardSizeDirective } from './graph-card-size.directive';
import { Router } from '@angular/router';

interface Viewport {
    zoom: number;
    panX: number;
    panY: number;
}

interface LegendEntry {
    type: RelationshipType;
    label: string;
    cssClass: string;
    markerBase: string;
}

/** A ready-to-render edge path, already clipped to both nodes' card boundaries and routed around any node it would otherwise cross. */
interface RenderableEdge {
    edge: GraphEdge;
    /** SVG path 'd' attribute — an orthogonal "M...L...L...L..." route: straight segments joined by 90° elbow turns, never a curve. */
    path: string;
    points: Point[];
    mx: number;
    my: number;
}

type RelationshipStyle = {
    cssClass: string;
    markerBase: string;
    sentence: (sourceTitle: string, targetTitle: string) => string;
};

@Component({
    selector: 'app-relationship-graph',
    imports: [CommonModule, MatIconModule, MatButtonModule, MatTooltipModule, GraphCardSizeDirective],
    templateUrl: './relationship-graph.component.html',
    styleUrls: ['./relationship-graph.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class RelationshipGraphComponent implements OnChanges {

    @Input({ required: true }) hub!: RelationshipHub;
    @Input({ required: true }) rootItemId!: number;
    @Input() rootStatus = '';
    @Input() rootPriority = '';
    @Input() rootBoardId?: number;

    @Output() openItem = new EventEmitter<number>();
    @Output() maximizedChange = new EventEmitter<boolean>();

    highlightedNode: number | null = null;

    // ---- template refs ----
    readonly svgRootRef = viewChild<ElementRef<SVGSVGElement>>('svgRoot');
    readonly canvasContainerRef = viewChild<ElementRef<HTMLDivElement>>('canvasContainer');

    // ---- constants ----
    readonly viewBoxSize = 800;
    readonly minZoom = 0.2;
    readonly maxZoom = 3;

    private readonly typeStyleMap: Record<RelationshipType, RelationshipStyle> = {
        [RelationshipType.Parent]: {
            cssClass: 'type-parent',
            markerBase: 'arrow-parent',
            sentence: (a, b) => `${a} is the parent of "${b}"`
        },
        [RelationshipType.Blocks]: {
            cssClass: 'type-blocks',
            markerBase: 'arrow-blocks',
            sentence: (a, b) => `${a} blocks "${b}"`
        },
        [RelationshipType.DependsOn]: {
            cssClass: 'type-depends-on',
            markerBase: 'arrow-depends-on',
            sentence: (a, b) => `${a} depends on "${b}"`
        },
        [RelationshipType.Related]: {
            cssClass: 'type-related',
            markerBase: 'arrow-related',
            sentence: (a, b) => `${a} is related to "${b}"`
        },
        [RelationshipType.Duplicate]: {
            cssClass: 'type-duplicate',
            markerBase: 'arrow-duplicate',
            sentence: (a, b) => `${a} is a duplicate of "${b}"`
        },
        [RelationshipType.SplitFrom]: {
            cssClass: 'type-split-from',
            markerBase: 'arrow-split-from',
            sentence: (a, b) => `${a} was split from "${b}"`
        }
    };

    readonly expandedNodeIds = signal<Set<number>>(new Set());
    /** nodeId -> set of node ids that were newly added directly because that node was expanded. */
    private readonly expandedChildren = new Map<number, Set<number>>();

    readonly legend: LegendEntry[] = [
        { type: RelationshipType.Parent, label: 'Parent', cssClass: 'type-parent', markerBase: 'arrow-parent' },
        { type: RelationshipType.Blocks, label: 'Blocks', cssClass: 'type-blocks', markerBase: 'arrow-blocks' },
        { type: RelationshipType.DependsOn, label: 'Depends on', cssClass: 'type-depends-on', markerBase: 'arrow-depends-on' },
        { type: RelationshipType.Related, label: 'Related', cssClass: 'type-related', markerBase: 'arrow-related' },
        { type: RelationshipType.Duplicate, label: 'Duplicate', cssClass: 'type-duplicate', markerBase: 'arrow-duplicate' },
        { type: RelationshipType.SplitFrom, label: 'Split from', cssClass: 'type-split-from', markerBase: 'arrow-split-from' }
    ];

    // ---- state ----
    readonly graph = signal<GraphViewModel | null>(null);
    readonly viewport = signal<Viewport>(this.defaultViewport());
    readonly viewportAnimated = signal<boolean>(false);

    readonly hoveredNodeId = signal<number | null>(null);
    readonly hoverScreenPos = signal<{ x: number; y: number } | null>(null);
    readonly hoverImpact = signal<ImpactAnalysis | null>(null);

    /** Edge-hover state, backing the relationship-sentence tooltip. */
    readonly hoveredEdgeId = signal<number | null>(null);
    readonly hoverEdgeScreenPos = signal<{ x: number; y: number } | null>(null);

    readonly selectedNodeId = signal<number | null>(null);
    readonly expandingNodeId = signal<number | null>(null);

    readonly showLegend = signal<boolean>(true);
    readonly showCriticalHighlights = signal<boolean>(false);

    readonly showFullConnections = signal<boolean>(false);
    readonly isExpandingFull = signal<boolean>(false);
    readonly fullConnectionsTruncated = signal<boolean>(false);

    readonly isMaximized = signal<boolean>(false);

    @HostBinding('class.graph-maximized')
    get graphMaximizedClass(): boolean {
        return this.isMaximized();
    }

    readonly cycleSummary = signal<RelationshipCycle[]>([]);
    readonly criticalSummary = signal<{ count: number } | null>(null);

    readonly nodes = computed<GraphNode[]>(() => this.graph()?.nodes ?? []);
    readonly edges = computed<GraphEdge[]>(() => this.graph()?.edges ?? []);
    readonly hasCycles = computed<boolean>(() => this.cycleSummary().length > 0);

    readonly renderableEdges = computed<RenderableEdge[]>(() => {
        const graph = this.graph();
        if (!graph) return [];

        const outgoingGroups = new Map<number, GraphEdge[]>();
        const incomingGroups = new Map<number, GraphEdge[]>();

        for (const edge of graph.edges) {
            if (!outgoingGroups.has(edge.sourceId)) outgoingGroups.set(edge.sourceId, []);
            if (!incomingGroups.has(edge.targetId)) incomingGroups.set(edge.targetId, []);
            outgoingGroups.get(edge.sourceId)!.push(edge);
            incomingGroups.get(edge.targetId)!.push(edge);
        }

        // Ties (other ends at the same x) broken by id, so lanes don't depend on edge insertion order.
        const sortByOtherEndX = (groups: Map<number, GraphEdge[]>, otherIdOf: (e: GraphEdge) => number) => {
            for (const list of groups.values()) {
                list.sort((a, b) => {
                    const na = graph.nodeMap.get(otherIdOf(a));
                    const nb = graph.nodeMap.get(otherIdOf(b));
                    return (na?.x ?? 0) - (nb?.x ?? 0) || otherIdOf(a) - otherIdOf(b);
                });
            }
        };
        sortByOtherEndX(outgoingGroups, e => e.targetId);
        sortByOtherEndX(incomingGroups, e => e.sourceId);

        // Route against the cards as rendered. A card not measured yet counts with its default size
        // as an obstacle, but an edge is only drawn once both of its own cards are measured.
        const heights = this.cardHeights();
        const cards: RouteCard[] = graph.nodes.map(n => ({
            id: n.id,
            x: n.x,
            y: n.y,
            rect: cardRect(n, heights.get(n.id) ?? n.height)
        }));
        const cardById = new Map(cards.map(c => [c.id, c]));

        const lines: RenderableEdge[] = [];

        for (const edge of graph.edges) {
            if (!heights.has(edge.sourceId) || !heights.has(edge.targetId)) continue;

            const source = cardById.get(edge.sourceId);
            const target = cardById.get(edge.targetId);
            if (!source || !target) continue;

            const outGroup = outgoingGroups.get(edge.sourceId) ?? [edge];
            const inGroup = incomingGroups.get(edge.targetId) ?? [edge];

            const route = routeEdge({
                edgeId: edge.id,
                relationType: edge.relationType,
                source,
                target,
                outIndex: outGroup.indexOf(edge),
                outCount: outGroup.length,
                inIndex: inGroup.indexOf(edge),
                inCount: inGroup.length,
                cards
            });

            lines.push({ edge, path: route.path, points: route.points, mx: route.mx, my: route.my });
        }

        return lines;
    });

    /**
     * Rendered card heights in graph units, by node id, from GraphCardSizeDirective. A card without an
     * entry hasn't been measured yet (or isn't rendered), and none of its edges are drawn.
     */
    readonly cardHeights = signal<ReadonlyMap<number, number>>(new Map());

    onCardSize(nodeId: number, height: number | null): void {
        const current = this.cardHeights();
        if (height === null ? !current.has(nodeId) : current.get(nodeId) === height) return;

        const next = new Map(current);
        if (height === null) {
            next.delete(nodeId);
        } else {
            next.set(nodeId, height);
        }
        this.cardHeights.set(next);
    }

    /** The card's height for its foreignObject: measured, or the default until it is. */
    cardHeight(node: GraphNode): number {
        return this.cardHeights().get(node.id) ?? node.height;
    }

    /**
     * Filter region for #edgeGlow, in graph units: everything drawn (cards and routed edges) plus room
     * for the widest stroke, the blur and an arrowhead. A user-space region, so a straight edge (whose
     * geometry box is 0 wide) is never clipped the way a bounding-box percentage region clips it.
     */
    readonly edgeGlowRegion = computed(() => {
        const padding = 40;
        const xs: number[] = [];
        const ys: number[] = [];
        const graph = this.graph();
        const heights = this.cardHeights();
        for (const node of graph?.nodes ?? []) {
            const rect = cardRect(node, heights.get(node.id) ?? node.height);
            xs.push(rect.left, rect.right);
            ys.push(rect.top, rect.bottom);
        }
        for (const line of this.renderableEdges()) {
            for (const p of line.points) {
                xs.push(p.x);
                ys.push(p.y);
            }
        }
        if (!xs.length) return { x: 0, y: 0, width: 0, height: 0 };
        const x = Math.min(...xs) - padding;
        const y = Math.min(...ys) - padding;
        return { x, y, width: Math.max(...xs) + padding - x, height: Math.max(...ys) + padding - y };
    });

    readonly viewportTransform = computed<string>(() => {
        const v = this.viewport();
        return `translate(${v.panX} ${v.panY}) scale(${v.zoom})`;
    });

    // ---- pan/drag internal state (not signals — pure interaction bookkeeping) ----
    private isPanning = false;
    private panPointerId: number | null = null;
    private panStartClient = { x: 0, y: 0 };
    private panOrigin: Viewport = this.defaultViewport();

    /** Lets a collapse undo exactly what its expansion placed, pushed and drew. */
    private readonly expansionTracker: GraphExpansionTracker;

    constructor(
        private readonly builder: RelationshipGraphBuilder,
        private readonly layoutEngine: GraphLayoutEngine,
        private readonly cycleDetector: CycleDetector,
        private readonly impactEngine: ImpactEngine,
        private readonly boardService: BoardService,
        private readonly router: Router
    ) {
        this.expansionTracker = new GraphExpansionTracker(layoutEngine);
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['hub'] || changes['rootItemId'] || changes['rootStatus'] || changes['rootPriority'] || changes['rootBoardId']) {
            this.rebuild();
        }
    }

    // =====================================================================
    // Rendering helpers used directly by the template
    // =====================================================================

    nodeAt(nodeId: number): GraphNode | undefined {
        return this.graph()?.nodeMap.get(nodeId);
    }

    /** foreignObject x — node.x is the card's CENTER, foreignObject wants a top-left corner. */
    nodeLeft(node: GraphNode): number {
        return node.x - node.width / 2;
    }

    /** foreignObject y — same corner correction as nodeLeft. */
    nodeTop(node: GraphNode): number {
        return node.y - node.height / 2;
    }

    isCenter(node: GraphNode): boolean {
        return node.id === this.rootItemId;
    }

    private static readonly PRIORITY_CSS_CLASS: Record<string, string> = {
        critical: 'priority-critical',
        high: 'priority-high',
        medium: 'priority-medium',
        low: 'priority-low'
    };

    /** CSS class for the node's actual business Priority (Critical/High/Medium/Low) — independent of graph topology. Empty/unrecognized -> ''. */
    priorityClass(priority: string | undefined | null): string {
        if (!priority) return '';
        return RelationshipGraphComponent.PRIORITY_CSS_CLASS[priority.trim().toLowerCase()] ?? '';
    }

    private isPriorityCritical(priority: string | undefined | null): boolean {
        return !!priority && priority.trim().toLowerCase() === 'critical';
    }

    isSelected(nodeId: number): boolean {
        return this.selectedNodeId() === nodeId;
    }

    isExpanding(nodeId: number): boolean {
        return this.expandingNodeId() === nodeId;
    }

    /** Nothing hovered -> nothing dimmed. Otherwise, only the hovered node and its direct neighbors stay at full opacity. */
    isDimmed(nodeId: number): boolean {
        const hoveredId = this.hoveredNodeId();
        if (hoveredId === null) return false;
        if (hoveredId === nodeId) return false;
        return !(this.graph()?.adjacency.get(hoveredId) ?? []).includes(nodeId);
    }

    isEdgeDimmed(edge: GraphEdge): boolean {
        const hoveredId = this.hoveredNodeId();
        if (hoveredId === null) return false;
        return edge.sourceId !== hoveredId && edge.targetId !== hoveredId;
    }

    isEdgeCritical(edge: GraphEdge): boolean {
        return this.showCriticalHighlights() && edge.critical;
    }

    /** CSS class carrying this edge's relationship-type dash pattern (never color). */
    edgeTypeClass(edge: GraphEdge): string {
        return this.typeStyleMap[edge.relationType]?.cssClass ?? 'type-related';
    }

    edgeMarkerEnd(edge: GraphEdge): string {
        const base = this.typeStyleMap[edge.relationType]?.markerBase ?? 'arrow-related';
        return `url(#${base}${this.isEdgeCritical(edge) ? '-critical' : ''})`;
    }

    relationshipSentence(edge: GraphEdge): string {
        const graph = this.graph();
        const source = graph?.nodeMap.get(edge.sourceId);
        const target = graph?.nodeMap.get(edge.targetId);
        if (!source || !target) return '';

        const style = this.typeStyleMap[edge.relationType];
        return style
            ? style.sentence(source.title, target.title)
            : `${source.title} is related to "${target.title}"`;
    }

    hoveredEdge(): GraphEdge | undefined {
        const id = this.hoveredEdgeId();
        if (id === null) return undefined;
        return this.graph()?.edges.find(e => e.id === id);
    }

    visualRadius(node: GraphNode): number {
        return Math.max(node.width, node.height) / 2;
    }

    truncateTitle(title: string): string {
        return title.length > 24 ? `${title.slice(0, 22)}…` : title;
    }

    trackNode(_: number, node: GraphNode): number {
        return node.id;
    }

    trackEdge(_: number, line: RenderableEdge): number {
        return line.edge.id;
    }

    // =====================================================================
    // Interaction: node hover (drives the downstream-impact tooltip)
    // =====================================================================

    onNodeEnter(node: GraphNode, event: MouseEvent): void {

        this.hoveredNodeId.set(node.id);
        this.updateHoverPosition(event);

        const graph = this.graph();
        if (!graph || this.isCenter(node)) {
            this.hoverImpact.set(null);
            return;
        }

        this.hoverImpact.set(this.impactEngine.analyze(graph, node.id));
    }

    onNodeMove(event: MouseEvent): void {
        if (this.hoveredNodeId() !== null) {
            this.updateHoverPosition(event);
        }
    }

    onNodeLeave(): void {
        this.hoveredNodeId.set(null);
        this.hoverScreenPos.set(null);
        this.hoverImpact.set(null);
    }

    private updateHoverPosition(event: MouseEvent): void {
        const container = this.canvasContainerRef()?.nativeElement;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        this.hoverScreenPos.set({
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        });
    }

    // =====================================================================
    // Interaction: edge hover (drives the relationship-sentence tooltip)
    // =====================================================================

    onEdgeEnter(edge: GraphEdge, event: MouseEvent): void {
        this.hoveredEdgeId.set(edge.id);
        this.updateEdgeHoverPosition(event);
    }

    onEdgeMove(event: MouseEvent): void {
        if (this.hoveredEdgeId() !== null) {
            this.updateEdgeHoverPosition(event);
        }
    }

    onEdgeLeave(): void {
        this.hoveredEdgeId.set(null);
        this.hoverEdgeScreenPos.set(null);
    }

    private updateEdgeHoverPosition(event: MouseEvent): void {
        const container = this.canvasContainerRef()?.nativeElement;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        this.hoverEdgeScreenPos.set({
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        });
    }

    onExpandClick(node: GraphNode, event: MouseEvent): void {

        event.stopPropagation();

        const graph = this.graph();
        if (!graph || this.expandingNodeId() !== null || this.isCenter(node)) return;

        if (this.isExpanded(node.id)) {
            this.collapseNode(node.id);
            return;
        }

        this.expandingNodeId.set(node.id);

        const beforeIds = new Set(graph.nodes.map(n => n.id));

        this.boardService.getRelationships(node.id).subscribe({
            next: hub => {

                const expanded = this.builder.expand(graph, node.id, hub);

                const addedIds = new Set(
                    expanded.nodes.map(n => n.id).filter(id => !beforeIds.has(id))
                );

                // Incremental: existing nodes (this one included) keep their positions, so the
                // viewport stays as it is.
                this.expansionTracker.recordExpansion(expanded, node.id, hub, addedIds);
                this.applyAnalytics(expanded);

                this.expandedChildren.set(node.id, addedIds);
                this.expandedNodeIds.update(set => new Set(set).add(node.id));

                this.graph.set({ ...expanded });

                this.expandingNodeId.set(null);
            },
            error: () => {
                this.expandingNodeId.set(null);
            }
        });
    }

    private collapseNode(nodeId: number): void {

        const graph = this.graph();
        if (!graph) return;

        const toRemove = new Set<number>();
        this.collectDescendants(nodeId, toRemove);

        const collapsedExpansionIds = [nodeId, ...Array.from(toRemove).filter(id => this.isExpanded(id))];

        this.expandedChildren.delete(nodeId);
        this.expandedNodeIds.update(set => {
            const next = new Set(set);
            next.delete(nodeId);
            toRemove.forEach(id => next.delete(id));
            return next;
        });

        // Runs even when the expansion added no nodes: it may still have drawn edges between
        // existing ones, which the collapse removes.
        this.expansionTracker.collapse(graph, toRemove, collapsedExpansionIds);
        this.applyAnalytics(graph);

        if (this.selectedNodeId() !== null && toRemove.has(this.selectedNodeId()!)) {
            this.selectedNodeId.set(null);
        }
        if (this.hoveredNodeId() !== null && toRemove.has(this.hoveredNodeId()!)) {
            this.onNodeLeave();
        }
        if (this.hoveredEdgeId() !== null && !graph.edges.some(e => e.id === this.hoveredEdgeId())) {
            this.onEdgeLeave();
        }

        this.graph.set({ ...graph });
        this.forgetRemovedCards(graph);
    }

    /**
     * Drops the measurements of cards that are no longer on the graph, so a card that comes back
     * (re-expansion) is measured again before its edges are drawn. Cards that stay keep their entry:
     * their element is kept (trackBy id) and won't report again unless it changes size.
     */
    private forgetRemovedCards(graph: GraphViewModel): void {
        const current = this.cardHeights();
        const ids = new Set(graph.nodes.map(n => n.id));
        if ([...current.keys()].every(id => ids.has(id))) return;
        this.cardHeights.set(new Map([...current].filter(([id]) => ids.has(id))));
    }

    /** Recursively collects every node id that was added, directly or indirectly, by expanding nodeId. */
    private collectDescendants(nodeId: number, acc: Set<number>): void {
        const children = this.expandedChildren.get(nodeId);
        if (!children) return;
        for (const childId of children) {
            if (acc.has(childId)) continue;
            acc.add(childId);
            this.collectDescendants(childId, acc);
        }
    }

    private readonly expansionBatchSize = 6;

    readonly maxFullConnectionNodes = 500;

    async toggleFullConnections(): Promise<void> {

        if (this.showFullConnections()) {
            this.rebuild(true);
            return;
        }

        this.showFullConnections.set(true);
        await this.expandFullyConnected();
    }

    private async expandFullyConnected(): Promise<void> {

        let graph = this.graph();
        if (!graph) return;

        this.isExpandingFull.set(true);
        this.fullConnectionsTruncated.set(false);

        const fetched = new Set<number>([graph.rootNodeId]);
        let frontier = new Set<number>(
            graph.nodes.map(n => n.id).filter(id => id !== graph!.rootNodeId)
        );

        try {
            while (frontier.size && graph.nodes.length < this.maxFullConnectionNodes) {

                const batch = Array.from(frontier);
                batch.forEach(id => fetched.add(id));

                const results = await this.fetchHubsInBatches(batch);
                const knownBefore = new Set(graph.nodes.map(n => n.id));

                for (const { itemId, hub } of results) {
                    if (!hub) continue;
                    graph = this.builder.expand(graph, itemId, hub);
                }

                frontier = new Set<number>();
                for (const node of graph.nodes) {
                    if (!knownBefore.has(node.id) && !fetched.has(node.id)) {
                        frontier.add(node.id);
                    }
                }
            }

            if (frontier.size) {
                this.fullConnectionsTruncated.set(true);
            }
        } finally {

            this.layoutEngine.layout(graph);
            this.expansionTracker.invalidate();
            this.applyAnalytics(graph);

            this.graph.set({ ...graph });

            this.fitToView();

            this.isExpandingFull.set(false);
        }
    }

    /** Fetches relationships for a list of item ids, a few at a time, tolerating individual failures. */
    private async fetchHubsInBatches(
        itemIds: number[]
    ): Promise<{ itemId: number; hub: RelationshipHub | null }[]> {

        const results: { itemId: number; hub: RelationshipHub | null }[] = [];

        for (let i = 0; i < itemIds.length; i += this.expansionBatchSize) {

            const chunk = itemIds.slice(i, i + this.expansionBatchSize);

            const chunkResults = await Promise.all(
                chunk.map(itemId =>
                    firstValueFrom(
                        this.boardService.getRelationships(itemId).pipe(
                            catchError(() => of(null))
                        )
                    ).then(hub => ({ itemId, hub }))
                )
            );

            results.push(...chunkResults);
        }

        return results;
    }

    // =====================================================================
    // Pan & zoom
    // =====================================================================

    onWheel(event: WheelEvent): void {

        event.preventDefault();

        const point = this.toViewBoxPoint(event.clientX, event.clientY);
        if (!point) return;

        const current = this.viewport();

        const worldX = (point.x - current.panX) / current.zoom;
        const worldY = (point.y - current.panY) / current.zoom;

        const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
        const newZoom = this.clampZoom(current.zoom * factor);

        this.viewportAnimated.set(false);
        this.viewport.set({
            zoom: newZoom,
            panX: point.x - worldX * newZoom,
            panY: point.y - worldY * newZoom
        });
    }

    onBackgroundPointerDown(event: PointerEvent): void {

        this.isPanning = true;
        this.panPointerId = event.pointerId;
        this.panStartClient = { x: event.clientX, y: event.clientY };
        this.panOrigin = this.viewport();

        this.viewportAnimated.set(false);
        (event.target as Element).setPointerCapture?.(event.pointerId);
    }

    onBackgroundPointerMove(event: PointerEvent): void {

        if (!this.isPanning || event.pointerId !== this.panPointerId) return;

        const start = this.toViewBoxPoint(this.panStartClient.x, this.panStartClient.y);
        const current = this.toViewBoxPoint(event.clientX, event.clientY);
        if (!start || !current) return;

        const dx = current.x - start.x;
        const dy = current.y - start.y;

        this.viewport.set({
            zoom: this.panOrigin.zoom,
            panX: this.panOrigin.panX + dx,
            panY: this.panOrigin.panY + dy
        });
    }

    onBackgroundPointerUp(event: PointerEvent): void {
        if (event.pointerId === this.panPointerId) {
            this.isPanning = false;
            this.panPointerId = null;
        }
    }

    zoomIn(): void {
        this.setZoomAroundCenter(this.clampZoom(this.viewport().zoom * 1.25));
    }

    zoomOut(): void {
        this.setZoomAroundCenter(this.clampZoom(this.viewport().zoom / 1.25));
    }

    resetView(): void {
        this.viewportAnimated.set(true);
        this.viewport.set(this.defaultViewport());
    }

    fitToView(): void {

        const graph = this.graph();

        if (!graph || !graph.nodes.length) {
            this.resetView();
            return;
        }

        const padding = 60;
        const radii = graph.nodes.map(n => this.visualRadius(n));
        const maxRadius = Math.max(...radii, 40);

        const minX = Math.min(...graph.nodes.map(n => n.x)) - maxRadius - padding;
        const maxX = Math.max(...graph.nodes.map(n => n.x)) + maxRadius + padding;
        const minY = Math.min(...graph.nodes.map(n => n.y)) - maxRadius - padding;
        const maxY = Math.max(...graph.nodes.map(n => n.y)) + maxRadius + padding;

        const contentWidth = Math.max(maxX - minX, 1);
        const contentHeight = Math.max(maxY - minY, 1);

        const zoom = this.clampZoom(Math.min(
            this.viewBoxSize / contentWidth,
            this.viewBoxSize / contentHeight
        ));

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const half = this.viewBoxSize / 2;

        this.viewportAnimated.set(true);
        this.viewport.set({
            zoom,
            panX: half - centerX * zoom,
            panY: half - centerY * zoom
        });
    }

    /** Pans/zooms so every node in a cycle is visible — used by the "Locate" action on the cycle banner. */
    focusOnNodes(nodeIds: number[]): void {

        const graph = this.graph();
        if (!graph || !nodeIds.length) return;

        const targets = nodeIds.map(id => graph.nodeMap.get(id)).filter((n): n is GraphNode => !!n);
        if (!targets.length) return;

        const padding = 80;
        const maxRadius = Math.max(...targets.map(n => this.visualRadius(n)), 40);

        const minX = Math.min(...targets.map(n => n.x)) - maxRadius - padding;
        const maxX = Math.max(...targets.map(n => n.x)) + maxRadius + padding;
        const minY = Math.min(...targets.map(n => n.y)) - maxRadius - padding;
        const maxY = Math.max(...targets.map(n => n.y)) + maxRadius + padding;

        const contentWidth = Math.max(maxX - minX, 1);
        const contentHeight = Math.max(maxY - minY, 1);

        const zoom = this.clampZoom(Math.min(
            this.viewBoxSize / contentWidth,
            this.viewBoxSize / contentHeight
        ));

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const half = this.viewBoxSize / 2;

        this.viewportAnimated.set(true);
        this.viewport.set({
            zoom,
            panX: half - centerX * zoom,
            panY: half - centerY * zoom
        });
    }

    toggleLegend(): void {
        this.showLegend.update(v => !v);
    }

    toggleCriticalHighlights(): void {
        this.showCriticalHighlights.update(v => !v);
    }

    toggleMaximize(): void {
        this.isMaximized.update(v => !v);
        this.maximizedChange.emit(this.isMaximized());
        requestAnimationFrame(() => this.fitToView());
    }

    @HostListener('window:keydown.escape')
    onEscapeKey(): void {
        if (this.isMaximized()) {
            this.toggleMaximize();
        }
    }

    // =====================================================================
    // Internals
    // =====================================================================

    private defaultViewport(): Viewport {
        const half = this.viewBoxSize / 2;
        return { zoom: 1, panX: half, panY: half };
    }

    private clampZoom(zoom: number): number {
        return Math.min(this.maxZoom, Math.max(this.minZoom, zoom));
    }

    private setZoomAroundCenter(newZoom: number): void {

        const half = this.viewBoxSize / 2;
        const current = this.viewport();

        const worldX = (half - current.panX) / current.zoom;
        const worldY = (half - current.panY) / current.zoom;

        this.viewportAnimated.set(true);
        this.viewport.set({
            zoom: newZoom,
            panX: half - worldX * newZoom,
            panY: half - worldY * newZoom
        });
    }

    /** Screen (client) coordinates -> SVG viewBox coordinates, via the root <svg>'s own CTM. Independent of pan/zoom. */
    private toViewBoxPoint(clientX: number, clientY: number): { x: number; y: number } | null {

        const svg = this.svgRootRef()?.nativeElement;
        if (!svg) return null;

        const ctm = svg.getScreenCTM();
        if (!ctm) return null;

        const point = svg.createSVGPoint();
        point.x = clientX;
        point.y = clientY;

        const transformed = point.matrixTransform(ctm.inverse());
        return { x: transformed.x, y: transformed.y };
    }

    private rebuild(animateViewport = false): void {

        if (!this.hub || this.rootItemId == null) {
            this.graph.set(null);
            this.cycleSummary.set([]);
            this.criticalSummary.set(null);
            return;
        }

        const built = this.builder.build(this.rootItemId, this.hub, this.rootStatus, this.rootPriority, this.rootBoardId);
        this.layoutEngine.layout(built);
        this.expansionTracker.reset(this.rootItemId, this.hub);
        this.applyAnalytics(built);

        this.graph.set(built);
        this.forgetRemovedCards(built);
        this.expandedNodeIds.set(new Set());
        this.expandedChildren.clear();
        this.selectedNodeId.set(null);

        if (this.isMaximized()) {
            // Maximized view keeps its existing behavior untouched.
            if (animateViewport) {
                this.fitToView();
            } else {
                this.viewportAnimated.set(false);
                this.viewport.set(this.defaultViewport());
            }
        } else {
            // Embedded dialog view: always auto-fit so the whole graph is
            // visible without the user needing to pan/zoom or scroll.
            this.viewportAnimated.set(animateViewport);
            this.fitToView();
        }

        this.showFullConnections.set(false);
        this.isExpandingFull.set(false);
        this.fullConnectionsTruncated.set(false);
    }

    private applyAnalytics(graph: GraphViewModel): void {

        const cyclesMarked = this.cycleDetector.markCycles(graph);

        const cyclicEdgeMap = new Map(cyclesMarked.edges.map(e => [e.id, e.cyclic]));

        graph.nodes = cyclesMarked.nodes.map(node => ({
            ...node,
            critical: this.isPriorityCritical(node.priority)
        }));

        const criticalNodeIds = new Set(graph.nodes.filter(n => n.critical).map(n => n.id));

        graph.edges = graph.edges.map(edge => ({
            ...edge,
            cyclic: cyclicEdgeMap.get(edge.id) ?? false,
            critical: criticalNodeIds.has(edge.sourceId) && criticalNodeIds.has(edge.targetId)
        }));

        rebuildIndex(graph);

        this.cycleSummary.set(this.cycleDetector.detectCycles(graph));
        const criticalEdgeCount = graph.edges.filter(e => e.critical).length;
        this.criticalSummary.set(criticalEdgeCount > 0 ? { count: criticalEdgeCount } : null);
    }

    onNodeHover(nodeId: number) {
        this.highlightedNode = nodeId;
    }

    onNodeClick(node: GraphNode): void {
        this.selectedNodeId.set(node.id);
    }

    isEdgeConnected(edge: GraphEdge, nodeId: number): boolean {
        return edge.sourceId === nodeId || edge.targetId === nodeId;
    }

    isEdgeActive(edge: GraphEdge): boolean {

        // Hovering an edge should illuminate that edge.
        if (this.hoveredEdgeId() === edge.id) {
            return true;
        }

        // Hovering a node should illuminate all connected edges.
        const hoveredNodeId = this.hoveredNodeId();
        if (hoveredNodeId === null) {
            return false;
        }

        return edge.sourceId === hoveredNodeId ||
            edge.targetId === hoveredNodeId;
    }

    openItemInNewTab(node: GraphNode, event: MouseEvent): void {
        event.stopPropagation(); // Prevents card selection activation

        // Without boardId the board page opens the first board and can't find the item.
        const queryParams: Record<string, number> = { openItemId: node.id };
        if (node.boardId != null) {
            queryParams['boardId'] = node.boardId;
        }

        const urlTree = this.router.createUrlTree(['/board'], { queryParams });

        window.open(this.router.serializeUrl(urlTree), '_blank');
    }

    isExpanded(nodeId: number): boolean {
        return this.expandedNodeIds().has(nodeId);
    }
}