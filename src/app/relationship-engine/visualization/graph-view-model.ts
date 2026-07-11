import { GraphNode } from './graph-node.model';
import { GraphEdge } from './graph-edge.model';

/**
 * Represents the complete graph that powers the
 * Relationship Intelligence Engine.
 *
 * It contains:
 *
 * • Graph data
 * • Lookup indexes
 * • Current viewport state
 * • User interaction state
 * • Analytics state
 *
 * This object is intentionally UI-framework agnostic.
 */
export interface GraphViewModel {

    /**
     * All nodes.
     */
    nodes: GraphNode[];

    /**
     * All edges.
     */
    edges: GraphEdge[];

    /**
     * Fast node lookup.
     */
    nodeMap: Map<number, GraphNode>;

    /**
     * Fast edge lookup.
     */
    edgeMap: Map<number, GraphEdge>;

    /**
     * Adjacency list.
     *
     * nodeId -> connected node ids
     */
    adjacency: Map<number, number[]>;

    /**
     * Incoming adjacency.
     */
    incoming: Map<number, number[]>;

    /**
     * Outgoing adjacency.
     */
    outgoing: Map<number, number[]>;

    /**
     * Root node.
     *
     * Usually the item currently opened.
     */
    rootNodeId: number;

    /**
     * Current selection.
     */
    selectedNodeId?: number;

    /**
     * Currently selected edge.
     */
    selectedEdgeId?: number;

    /**
     * Viewport position.
     */
    viewport: GraphViewport;

    /**
     * Graph analytics.
     */
    analytics: GraphAnalytics;

    /**
     * Layout information.
     */
    layout: GraphLayoutState;

    /**
     * Navigation state.
     */
    navigation: GraphNavigationState;

}

/**
 * Viewport state.
 */
export interface GraphViewport {

    zoom: number;

    offsetX: number;

    offsetY: number;

    minZoom: number;

    maxZoom: number;

}

/**
 * Runtime analytics.
 */
export interface GraphAnalytics {

    nodeCount: number;

    edgeCount: number;

    maxDepth: number;

    isolatedNodes: number;

    cyclic: boolean;

    cycleCount: number;

    dependencyCount: number;

    criticalPathLength: number;

    averageDegree: number;

}

/**
 * Layout information.
 */
export interface GraphLayoutState {

    width: number;

    height: number;

    levelSpacing: number;

    siblingSpacing: number;

    initialized: boolean;

}

/**
 * Navigation runtime state.
 */
export interface GraphNavigationState {

    focusedNodeId?: number;

    hoveredNodeId?: number;

    highlightedNodes: Set<number>;

    highlightedEdges: Set<number>;

    expandedNodes: Set<number>;

}

/**
 * Factory used throughout the engine.
 */
export class GraphViewModelFactory {

    static create(rootNodeId: number): GraphViewModel {

        return {

            nodes: [],

            edges: [],

            nodeMap: new Map(),

            edgeMap: new Map(),

            adjacency: new Map(),

            incoming: new Map(),

            outgoing: new Map(),

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

                nodeCount: 0,

                edgeCount: 0,

                maxDepth: 0,

                isolatedNodes: 0,

                cyclic: false,

                cycleCount: 0,

                dependencyCount: 0,

                criticalPathLength: 0,

                averageDegree: 0

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

    }

}