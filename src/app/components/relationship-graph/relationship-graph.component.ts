import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    EventEmitter,
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

interface Viewport {
    zoom: number;
    panX: number;
    panY: number;
}

interface LegendEntry {
    type: RelationshipType;
    label: string;
    color: string;
}

/** A ready-to-render edge line, already clipped to both nodes' card boundaries (not their centers). */
interface RenderableEdge {
    edge: GraphEdge;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

/**
 * Flagship relationship graph.
 *
 * This component owns NO graph algorithms. Every piece of intelligence
 * on screen — cycle warnings, the critical path, node risk sizing, the
 * hover impact preview — is a direct call into the existing analytics
 * engines. Layout, including multi-hop expansion, is entirely owned by
 * GraphLayoutEngine now: this component no longer overrides node
 * positions after the fact (see graph-layout-engine.ts for why the old
 * "arc around the expansion parent" patch was removed rather than
 * kept — it's not that it was wrong, it's that the layout engine can
 * now do the real thing for every node, not just the first hop).
 *
 * This component's job is: assemble (via the builder), annotate (via
 * the engines), lay out (via the layout engine), and render.
 */
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

    readonly legend: LegendEntry[] = [
        { type: RelationshipType.Parent, label: 'Parent', color: '#1976d2' },
        { type: RelationshipType.Blocks, label: 'Blocks', color: '#e53935' },
        { type: RelationshipType.DependsOn, label: 'Depends on', color: '#7b1fa2' },
        { type: RelationshipType.Related, label: 'Related', color: '#43a047' },
        { type: RelationshipType.Duplicate, label: 'Duplicate', color: '#fb8c00' },
        { type: RelationshipType.SplitFrom, label: 'Split from', color: '#00897b' }
    ];

    // ---- state ----
    readonly graph = signal<GraphViewModel | null>(null);
    readonly viewport = signal<Viewport>(this.defaultViewport());
    readonly viewportAnimated = signal<boolean>(false);

    readonly hoveredNodeId = signal<number | null>(null);
    readonly hoverScreenPos = signal<{ x: number; y: number } | null>(null);
    readonly hoverImpact = signal<ImpactAnalysis | null>(null);

    readonly selectedNodeId = signal<number | null>(null);
    readonly expandingNodeId = signal<number | null>(null);

    readonly showLegend = signal<boolean>(true);
    readonly showCriticalPath = signal<boolean>(false);

    readonly cycleSummary = signal<RelationshipCycle[]>([]);
    readonly criticalPathSummary = signal<{ count: number; duration: number } | null>(null);

    readonly nodes = computed<GraphNode[]>(() => this.graph()?.nodes ?? []);
    readonly edges = computed<GraphEdge[]>(() => this.graph()?.edges ?? []);
    readonly hasCycles = computed<boolean>(() => this.cycleSummary().length > 0);

    /**
     * Edge lines clipped to each endpoint's card boundary rather than
     * its center. Computed once per graph/position change instead of
     * being recalculated per template binding (x1/y1/x2/y2 would each
     * have re-derived it independently otherwise).
     */
    readonly renderableEdges = computed<RenderableEdge[]>(() => {

        const graph = this.graph();
        if (!graph) return [];

        const lines: RenderableEdge[] = [];

        for (const edge of graph.edges) {

            const source = graph.nodeMap.get(edge.sourceId);
            const target = graph.nodeMap.get(edge.targetId);
            if (!source || !target) continue;

            const start = this.clipToRect(source, target.x, target.y, 0);
            const end = this.clipToRect(target, source.x, source.y, this.arrowGap);

            lines.push({ edge, x1: start.x, y1: start.y, x2: end.x, y2: end.y });
        }

        return lines;
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

    constructor(
        private readonly builder: RelationshipGraphBuilder,
        private readonly layoutEngine: GraphLayoutEngine,
        private readonly cycleDetector: CycleDetector,
        private readonly criticalPathEngine: CriticalPathEngine,
        private readonly scoreEngine: RelationshipScoreEngine,
        private readonly impactEngine: ImpactEngine,
        private readonly boardService: BoardService
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

    /**
     * Visual radius including a risk bump: higher RelationshipScoreEngine
     * score -> visibly larger node, up to +16px. Used for bounding-box
     * math (fitToView/focusOnNodes) — the card itself is rectangular, so
     * this is a conservative circular approximation, not the render size.
     */
    visualRadius(node: GraphNode): number {
        const bump = (node.relationshipScore / 100) * 16;
        return Math.max(node.width, node.height) / 2 + bump;
    }

    truncateTitle(title: string): string {
        return title.length > 24 ? `${title.slice(0, 22)}…` : title;
    }

    legendColor(type: RelationshipType): string {
        return this.legend.find(l => l.type === type)?.color ?? '#757575';
    }

    trackNode(_: number, node: GraphNode): number {
        return node.id;
    }

    trackEdge(_: number, line: RenderableEdge): number {
        return line.edge.id;
    }

    // =====================================================================
    // Interaction: hover
    // =====================================================================

    onNodeEnter(node: GraphNode, event: MouseEvent): void {

        this.hoveredNodeId.set(node.id);
        this.updateHoverPosition(event);

        const graph = this.graph();
        if (!graph || this.isCenter(node)) {
            this.hoverImpact.set(null);
            return;
        }

        // Computed on demand rather than for every node up front — graphs
        // in this view are small enough that this is effectively instant,
        // and it avoids paying for impact analysis on nodes nobody looks at.
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

    /**
     * Pulls this node's own relationships in and merges them into the
     * graph in place — the path from a one-hop star to a real multi-hop
     * graph. GraphLayoutEngine.layout() re-derives positions for the
     * WHOLE graph from the BFS tree, so every node (not just the newly
     * added ones) ends up with a position consistent with the same
     * single layout rule — there is no separate "expanded node"
     * placement path anymore.
     */
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

                // applyAnalytics already replaced expanded.nodes/edges with
                // fresh array references and rebuilt the index, so a shallow
                // spread of the top-level object is enough for the `graph`
                // signal's Object.is check to see this as a real change.
                this.graph.set({ ...expanded });

                this.expandingNodeId.set(null);
            },
            error: () => {
                this.expandingNodeId.set(null);
            }
        });
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

    /**
     * Finds where the line from `node`'s center toward (towardX, towardY)
     * crosses `node`'s own rectangular boundary, optionally pushed
     * `gap` units further out. This replaces the old fixed marker
     * refX="28" offset, which assumed a small circular node — on a
     * ~220x108 rectangular card that fixed offset landed the arrowhead
     * underneath the opaque card instead of at its visible edge.
     */
    private clipToRect(
        node: GraphNode,
        towardX: number,
        towardY: number,
        gap: number
    ): { x: number; y: number } {

        const dx = towardX - node.x;
        const dy = towardY - node.y;

        if (dx === 0 && dy === 0) {
            return { x: node.x, y: node.y };
        }

        const halfW = node.width / 2;
        const halfH = node.height / 2;

        const scaleX = dx !== 0 ? halfW / Math.abs(dx) : Infinity;
        const scaleY = dy !== 0 ? halfH / Math.abs(dy) : Infinity;
        const scale = Math.min(scaleX, scaleY);

        const boundaryX = node.x + dx * scale;
        const boundaryY = node.y + dy * scale;

        if (gap === 0) {
            return { x: boundaryX, y: boundaryY };
        }

        const length = Math.hypot(dx, dy);
        const normX = dx / length;
        const normY = dy / length;

        return { x: boundaryX + normX * gap, y: boundaryY + normY * gap };
    }

    private rebuild(): void {

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
        this.viewportAnimated.set(false);
        this.viewport.set(this.defaultViewport());
    }

    /**
     * The one place graph assembly meets graph intelligence: runs the
     * cycle, critical-path, and scoring engines and folds their output
     * back onto fresh node/edge objects, then rebuilds the index so
     * nodeMap/edgeMap/adjacency stay consistent with what's about to be
     * rendered. Mutates `graph` in place (replaces .nodes/.edges) —
     * callers are responsible for giving the `graph` signal a fresh
     * top-level object reference afterward.
     */
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

}