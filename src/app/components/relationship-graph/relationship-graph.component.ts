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

import { CycleDetector, RelationshipCycle } from '../../relationship-engine/analytics/cycle-detector';
import { CriticalPathEngine } from '../../relationship-engine/analytics/critical-path-engine';
import { RelationshipScoreEngine } from '../../relationship-engine/analytics/relationship-score-engine';
import { ImpactEngine, ImpactAnalysis } from '../../relationship-engine/analytics/impact-engine';

import { GraphNode } from '../../relationship-engine/visualization/graph-node.model';
import { GraphEdge } from '../../relationship-engine/visualization/graph-edge.model';
import { GraphViewModel, rebuildIndex } from '../../relationship-engine/visualization/graph-view-model';
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
    standalone: true,
    imports: [CommonModule, MatIconModule, MatButtonModule, MatTooltipModule],
    templateUrl: './relationship-graph.component.html',
    styleUrls: ['./relationship-graph.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class RelationshipGraphComponent implements OnChanges {

    @Input({ required: true }) hub!: RelationshipHub;
    @Input({ required: true }) rootItemId!: number;

    @Output() openItem = new EventEmitter<number>();

    highlightedNode: number | null = null;

    // ---- template refs ----
    readonly svgRootRef = viewChild<ElementRef<SVGSVGElement>>('svgRoot');
    readonly canvasContainerRef = viewChild<ElementRef<HTMLDivElement>>('canvasContainer');

    // ---- constants ----
    readonly viewBoxSize = 800;
    readonly minZoom = 0.2;
    readonly maxZoom = 3;

    /** Extra gap (world units) beyond a card's edge before an arrowhead is drawn, so the tip is visible instead of hidden under the target card. */
    private readonly arrowGap = 6;

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
    readonly showCriticalPath = signal<boolean>(false);

    readonly showFullConnections = signal<boolean>(false);
    readonly isExpandingFull = signal<boolean>(false);
    readonly fullConnectionsTruncated = signal<boolean>(false);

    readonly isMaximized = signal<boolean>(false);

    @HostBinding('class.graph-maximized')
    get graphMaximizedClass(): boolean {
        return this.isMaximized();
    }

    readonly cycleSummary = signal<RelationshipCycle[]>([]);
    readonly criticalPathSummary = signal<{ count: number; duration: number } | null>(null);

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

        const sortByOtherEndX = (groups: Map<number, GraphEdge[]>, otherIdOf: (e: GraphEdge) => number) => {
            for (const list of groups.values()) {
                list.sort((a, b) => {
                    const na = graph.nodeMap.get(otherIdOf(a));
                    const nb = graph.nodeMap.get(otherIdOf(b));
                    return (na?.x ?? 0) - (nb?.x ?? 0);
                });
            }
        };
        sortByOtherEndX(outgoingGroups, e => e.targetId);
        sortByOtherEndX(incomingGroups, e => e.sourceId);

        const lines: RenderableEdge[] = [];

        for (const edge of graph.edges) {
            const source = graph.nodeMap.get(edge.sourceId);
            const target = graph.nodeMap.get(edge.targetId);
            if (!source || !target) continue;

            const outGroup = outgoingGroups.get(edge.sourceId) ?? [edge];
            const inGroup = incomingGroups.get(edge.targetId) ?? [edge];

            // Anything that isn't one of this edge's own endpoints is a
            // potential obstacle — real collision testing, not a special case
            // for one node id.
            const obstacles = graph.nodes.filter(n => n.id !== source.id && n.id !== target.id);

            lines.push({
                edge,
                ...this.routeEdge(
                    source, target,
                    outGroup.indexOf(edge), outGroup.length,
                    inGroup.indexOf(edge), inGroup.length,
                    obstacles
                )
            });
        }

        return lines;
    });

    /** Gap (world units) between parallel edge lanes leaving/entering the same node. */
    private readonly laneGap = 12;

    /** Extra clearance kept between a detour corridor and the node it's routing around. */
    private readonly detourMargin = 28;

    private routeEdge(
        source: GraphNode,
        target: GraphNode,
        outIndex: number,
        outCount: number,
        inIndex: number,
        inCount: number,
        obstacles: GraphNode[]
    ): { path: string; mx: number; my: number } {

        const exitOffset = outCount > 1 ? (outIndex - (outCount - 1) / 2) * this.laneGap : 0;
        const entryOffset = inCount > 1 ? (inIndex - (inCount - 1) / 2) * this.laneGap : 0;

        const sourceHalfW = source.width / 2, sourceHalfH = source.height / 2;
        const targetHalfW = target.width / 2, targetHalfH = target.height / 2;

        const dx = target.x - source.x;
        const dy = target.y - source.y;

        const sameRow = Math.abs(dy) < Math.max(sourceHalfH, targetHalfH) + 20;
        const sameColumn = Math.abs(dx) < Math.max(sourceHalfW, targetHalfW) + 20;

        let points: { x: number; y: number }[];

        if (sameRow && !sameColumn) {
            // Natural left<->right flow: exit/enter from the facing sides.
            const goRight = dx > 0;
            const startX = source.x + (goRight ? sourceHalfW : -sourceHalfW);
            const startY = source.y + exitOffset;
            const endX = target.x + (goRight ? -targetHalfW - this.arrowGap : targetHalfW + this.arrowGap);
            const endY = target.y + entryOffset;

            points = startY === endY
                ? [{ x: startX, y: startY }, { x: endX, y: endY }]
                : [
                    { x: startX, y: startY },
                    { x: (startX + endX) / 2, y: startY },
                    { x: (startX + endX) / 2, y: endY },
                    { x: endX, y: endY }
                ];

        } else if (sameColumn) {
            // Natural up<->down flow: straight drop/rise, offset within each card's edge.
            const goDown = dy > 0;
            const startX = source.x + exitOffset;
            const startY = source.y + (goDown ? sourceHalfH : -sourceHalfH);
            const endX = target.x + entryOffset;
            const endY = target.y + (goDown ? -targetHalfH - this.arrowGap : targetHalfH + this.arrowGap);

            points = [{ x: startX, y: startY }, { x: endX, y: startY }, { x: endX, y: endY }];

        } else {
            // Diagonal: leave the side facing the target, one elbow into the
            // target's top or bottom edge.
            const goRight = dx > 0;
            const goDown = dy > 0;
            const startX = source.x + (goRight ? sourceHalfW : -sourceHalfW);
            const startY = source.y + exitOffset;
            const endX = target.x + entryOffset;
            const endY = target.y + (goDown ? -targetHalfH - this.arrowGap : targetHalfH + this.arrowGap);

            points = [{ x: startX, y: startY }, { x: endX, y: startY }, { x: endX, y: endY }];
        }

        // Only now do we check for a real collision — this replaces the old
        // "always detour if far enough right" hack with an actual test.
        const blocker = obstacles.find(n => this.pathIntersectsRect(points, n));
        if (blocker) {
            points = this.detourAroundNode(points, blocker);
        }

        const path = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
        const mid = points[Math.floor((points.length - 1) / 2)];
        return { path, mx: (mid.x + points[Math.min(points.length - 1, Math.floor((points.length - 1) / 2) + 1)].x) / 2, my: mid.y };
    }

    private detourAroundNode(
        points: { x: number; y: number }[],
        blocker: GraphNode
    ): { x: number; y: number }[] {

        const start = points[0];
        const end = points[points.length - 1];

        const distanceAbove = Math.abs(start.y - (blocker.y - blocker.height / 2 - this.detourMargin));
        const distanceBelow = Math.abs(start.y - (blocker.y + blocker.height / 2 + this.detourMargin));
        const goAbove = distanceAbove <= distanceBelow;

        const corridorY = goAbove
            ? blocker.y - blocker.height / 2 - this.detourMargin
            : blocker.y + blocker.height / 2 + this.detourMargin;

        return [
            start,
            { x: start.x, y: corridorY },
            { x: end.x, y: corridorY },
            end
        ];
    }

    /** True if any segment of an orthogonal (multi-point) path passes through node's bounding box. */
    private pathIntersectsRect(
        points: { x: number; y: number }[],
        node: GraphNode
    ): boolean {
        for (let i = 0; i < points.length - 1; i++) {
            if (this.segmentIntersectsRect(points[i], points[i + 1], node)) {
                return true;
            }
        }
        return false;
    }

    /** True if the segment p1->p2 passes through node's bounding box (padded slightly so near-misses still count). */
    private segmentIntersectsRect(
        p1: { x: number; y: number },
        p2: { x: number; y: number },
        node: GraphNode
    ): boolean {

        const pad = 10;
        const left = node.x - node.width / 2 - pad;
        const right = node.x + node.width / 2 + pad;
        const top = node.y - node.height / 2 - pad;
        const bottom = node.y + node.height / 2 + pad;

        const segMinX = Math.min(p1.x, p2.x), segMaxX = Math.max(p1.x, p2.x);
        const segMinY = Math.min(p1.y, p2.y), segMaxY = Math.max(p1.y, p2.y);
        if (segMaxX < left || segMinX > right || segMaxY < top || segMinY > bottom) {
            return false;
        }

        const inside = (p: { x: number; y: number }) =>
            p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;
        if (inside(p1) || inside(p2)) return true;

        const corners = [
            { x: left, y: top }, { x: right, y: top },
            { x: right, y: bottom }, { x: left, y: bottom }
        ];

        for (let i = 0; i < 4; i++) {
            if (this.segmentsIntersect(p1, p2, corners[i], corners[(i + 1) % 4])) {
                return true;
            }
        }

        return false;
    }

    private segmentsIntersect(
        p1: { x: number; y: number }, p2: { x: number; y: number },
        p3: { x: number; y: number }, p4: { x: number; y: number }
    ): boolean {
        const d1 = this.cross(p3, p4, p1);
        const d2 = this.cross(p3, p4, p2);
        const d3 = this.cross(p1, p2, p3);
        const d4 = this.cross(p1, p2, p4);

        return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
            && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
    }

    private cross(
        a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }
    ): number {
        return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    }

    readonly viewportTransform = computed<string>(() => {
        const v = this.viewport();
        return `translate(${v.panX} ${v.panY}) scale(${v.zoom})`;
    });

    // ---- pan/drag internal state (not signals — pure interaction bookkeeping) ----
    private isPanning = false;
    private panPointerId: number | null = null;
    private panStartClient = { x: 0, y: 0 };
    private panOrigin: Viewport = this.defaultViewport();

    constructor(
        private readonly builder: RelationshipGraphBuilder,
        private readonly layoutEngine: GraphLayoutEngine,
        private readonly cycleDetector: CycleDetector,
        private readonly criticalPathEngine: CriticalPathEngine,
        private readonly scoreEngine: RelationshipScoreEngine,
        private readonly impactEngine: ImpactEngine,
        private readonly boardService: BoardService,
        private readonly router: Router
    ) { }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['hub'] || changes['rootItemId']) {
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
        return this.showCriticalPath() && edge.critical;
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
        const bump = (node.relationshipScore / 100) * 16;
        return Math.max(node.width, node.height) / 2 + bump;
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

        this.expandingNodeId.set(node.id);

        this.boardService.getRelationships(node.id).subscribe({
            next: hub => {

                const expanded = this.builder.expand(graph, node.id, hub);
                this.layoutEngine.layout(expanded);

                this.applyAnalytics(expanded);

                this.graph.set({ ...expanded });

                this.expandingNodeId.set(null);
            },
            error: () => {
                this.expandingNodeId.set(null);
            }
        });
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

    toggleCriticalPath(): void {
        this.showCriticalPath.update(v => !v);
    }

    toggleMaximize(): void {
        this.isMaximized.update(v => !v);
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
            this.criticalPathSummary.set(null);
            return;
        }

        const built = this.builder.build(this.rootItemId, this.hub);
        this.layoutEngine.layout(built);
        this.applyAnalytics(built);

        this.graph.set(built);
        this.selectedNodeId.set(null);

        if (animateViewport) {
            // Same path expand uses to unzoom smoothly — frame the
            // rebuilt (smaller) graph instead of hard-resetting to the
            // default centered/zoom-1 viewport.
            this.fitToView();
        } else {
            this.viewportAnimated.set(false);
            this.viewport.set(this.defaultViewport());
        }

        this.showFullConnections.set(false);
        this.isExpandingFull.set(false);
        this.fullConnectionsTruncated.set(false);
    }

    private applyAnalytics(graph: GraphViewModel): void {

        const cyclesMarked = this.cycleDetector.markCycles(graph);
        const criticalNodes = this.criticalPathEngine.markCriticalNodes(graph);
        const criticalPathResult = this.criticalPathEngine.findCriticalPath(graph);
        const scores = this.scoreEngine.calculateScores(graph);

        const scoreMap = new Map(scores.map(s => [s.nodeId, s]));
        const criticalNodeIds = new Set(criticalNodes.filter(n => n.critical).map(n => n.id));
        const cyclicEdgeMap = new Map(cyclesMarked.edges.map(e => [e.id, e.cyclic]));

        const criticalEdgeKeys = new Set<string>();
        for (let i = 0; i < criticalPathResult.path.length - 1; i++) {
            criticalEdgeKeys.add(`${criticalPathResult.path[i]}->${criticalPathResult.path[i + 1]}`);
        }

        graph.nodes = cyclesMarked.nodes.map(node => {
            const score = scoreMap.get(node.id);
            return {
                ...node,
                critical: criticalNodeIds.has(node.id),
                relationshipScore: score?.score ?? node.relationshipScore
            };
        });

        graph.edges = graph.edges.map(edge => ({
            ...edge,
            cyclic: cyclicEdgeMap.get(edge.id) ?? false,
            critical: criticalEdgeKeys.has(`${edge.sourceId}->${edge.targetId}`)
        }));

        rebuildIndex(graph);

        this.cycleSummary.set(this.cycleDetector.detectCycles(graph));
        this.criticalPathSummary.set(
            criticalPathResult.path.length > 1
                ? { count: criticalPathResult.path.length, duration: criticalPathResult.duration }
                : null
        );
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
        const hoveredId = this.hoveredNodeId();
        if (hoveredId === null) return false;
        return edge.sourceId === hoveredId || edge.targetId === hoveredId;
    }

    openItemInNewTab(itemId: number, event: MouseEvent): void {
    event.stopPropagation(); // Prevents card selection activation
    
    const urlTree = this.router.createUrlTree(['/board'], {
        queryParams: { openItemId: itemId }
    });
    
    window.open(this.router.serializeUrl(urlTree), '_blank');
}
}