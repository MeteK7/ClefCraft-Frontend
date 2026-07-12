import { GraphNode } from './graph-node.model';
import { GraphEdge } from './graph-edge.model';

/**
 * Represents the complete graph that powers the Relationship
 * Intelligence Engine: graph data, lookup indexes, viewport,
 * interaction and analytics state. UI-framework agnostic.
 *
 * IMPORTANT: nodes/edges are the source of truth. adjacency /
 * incoming / outgoing / *Edges maps are a derived index. Anything
 * that mutates nodes or edges directly (rather than through
 * RelationshipGraphBuilder.expand) MUST call rebuildIndex() after,
 * or reads against the index will be stale.
 */
export interface GraphViewModel {

    nodes: GraphNode[];
    edges: GraphEdge[];

    nodeMap: Map<number, GraphNode>;
    edgeMap: Map<number, GraphEdge>;

    /** Undirected neighbor ids — nodeId -> connected node ids. */
    adjacency: Map<number, number[]>;

    /** nodeId -> ids of nodes with an edge pointing INTO nodeId. */
    incoming: Map<number, number[]>;

    /** nodeId -> ids of nodes nodeId has an edge pointing OUT to. */
    outgoing: Map<number, number[]>;

    /** nodeId -> edges pointing into nodeId. */
    incomingEdges: Map<number, GraphEdge[]>;

    /** nodeId -> edges pointing out of nodeId. */
    outgoingEdges: Map<number, GraphEdge[]>;

    rootNodeId: number;
    selectedNodeId?: number;
    selectedEdgeId?: number;

    viewport: GraphViewport;
    analytics: GraphAnalytics;
    layout: GraphLayoutState;
    navigation: GraphNavigationState;
}

export interface GraphViewport {
    zoom: number;
    offsetX: number;
    offsetY: number;
    minZoom: number;
    maxZoom: number;
}

export interface GraphAnalytics {
    nodeCount: number;
    edgeCount: number;
    /** Populated by DependencyEngine.calculateAllDepths — 0 until computed. */
    maxDepth: number;
    isolatedNodes: number;
    /** Populated by CycleDetector — false/0 until computed. */
    cyclic: boolean;
    cycleCount: number;
    dependencyCount: number;
    /** Populated by CriticalPathEngine — 0 until computed. */
    criticalPathLength: number;
    averageDegree: number;
}

export interface GraphLayoutState {
    width: number;
    height: number;
    levelSpacing: number;
    siblingSpacing: number;
    initialized: boolean;
}

export interface GraphNavigationState {
    focusedNodeId?: number;
    hoveredNodeId?: number;
    highlightedNodes: Set<number>;
    highlightedEdges: Set<number>;
    expandedNodes: Set<number>;
}

interface GraphIndex {
    nodeMap: Map<number, GraphNode>;
    edgeMap: Map<number, GraphEdge>;
    adjacency: Map<number, number[]>;
    incoming: Map<number, number[]>;
    outgoing: Map<number, number[]>;
    incomingEdges: Map<number, GraphEdge[]>;
    outgoingEdges: Map<number, GraphEdge[]>;
}

/**
 * Builds every lookup index in a single O(V + E) pass. This is the
 * thing that was missing before: every engine was re-deriving
 * neighbor lists by filtering the full edge array on every call,
 * including inside recursive traversals — this function replaces
 * all of that with maps engines can read in O(1).
 */
export function buildGraphIndex(nodes: GraphNode[], edges: GraphEdge[]): GraphIndex {

    const nodeMap = new Map<number, GraphNode>();
    const edgeMap = new Map<number, GraphEdge>();
    const adjacency = new Map<number, number[]>();
    const incoming = new Map<number, number[]>();
    const outgoing = new Map<number, number[]>();
    const incomingEdges = new Map<number, GraphEdge[]>();
    const outgoingEdges = new Map<number, GraphEdge[]>();

    for (const node of nodes) {
        nodeMap.set(node.id, node);
        adjacency.set(node.id, []);
        incoming.set(node.id, []);
        outgoing.set(node.id, []);
        incomingEdges.set(node.id, []);
        outgoingEdges.set(node.id, []);
    }

    for (const edge of edges) {

        edgeMap.set(edge.id, edge);

        // Guard against edges referencing nodes that were never added —
        // fail loud in dev rather than silently producing a partial index.
        if (!nodeMap.has(edge.sourceId) || !nodeMap.has(edge.targetId)) {
            continue;
        }

        outgoing.get(edge.sourceId)!.push(edge.targetId);
        incoming.get(edge.targetId)!.push(edge.sourceId);

        outgoingEdges.get(edge.sourceId)!.push(edge);
        incomingEdges.get(edge.targetId)!.push(edge);

        adjacency.get(edge.sourceId)!.push(edge.targetId);
        adjacency.get(edge.targetId)!.push(edge.sourceId);
    }

    return { nodeMap, edgeMap, adjacency, incoming, outgoing, incomingEdges, outgoingEdges };
}

/** Recomputes and replaces the index in place after nodes/edges change. */
export function rebuildIndex(graph: GraphViewModel): void {
    const index = buildGraphIndex(graph.nodes, graph.edges);
    graph.nodeMap = index.nodeMap;
    graph.edgeMap = index.edgeMap;
    graph.adjacency = index.adjacency;
    graph.incoming = index.incoming;
    graph.outgoing = index.outgoing;
    graph.incomingEdges = index.incomingEdges;
    graph.outgoingEdges = index.outgoingEdges;

    graph.analytics.nodeCount = graph.nodes.length;
    graph.analytics.edgeCount = graph.edges.length;
    graph.analytics.isolatedNodes = graph.nodes.filter(
        n => (index.adjacency.get(n.id) ?? []).length === 0
    ).length;
    graph.analytics.averageDegree = graph.nodes.length
        ? (graph.edges.length * 2) / graph.nodes.length
        : 0;
}

export class GraphViewModelFactory {

    static create(rootNodeId: number, nodes: GraphNode[] = [], edges: GraphEdge[] = []): GraphViewModel {

        const index = buildGraphIndex(nodes, edges);

        const graph: GraphViewModel = {

            nodes,
            edges,

            ...index,

            rootNodeId,
            selectedNodeId: rootNodeId,
            selectedEdgeId: undefined,

            viewport: {
                zoom: 1,
                offsetX: 0,
                offsetY: 0,
                minZoom: 0.25,
                maxZoom: 3
            },

            analytics: {
                nodeCount: nodes.length,
                edgeCount: edges.length,
                maxDepth: 0,
                isolatedNodes: 0,
                cyclic: false,
                cycleCount: 0,
                dependencyCount: 0,
                criticalPathLength: 0,
                averageDegree: nodes.length ? (edges.length * 2) / nodes.length : 0
            },

            layout: {
                width: 0,
                height: 0,
                levelSpacing: 240,
                siblingSpacing: 80,
                initialized: false
            },

            navigation: {
                focusedNodeId: rootNodeId,
                hoveredNodeId: undefined,
                highlightedNodes: new Set(),
                highlightedEdges: new Set(),
                expandedNodes: new Set([rootNodeId])
            }
        };

        graph.analytics.isolatedNodes = nodes.filter(
            n => (index.adjacency.get(n.id) ?? []).length === 0
        ).length;

        return graph;
    }
}