import { GraphNode } from '../visualization/graph-node.model';
import { GraphEdge } from '../visualization/graph-edge.model';
import { GraphViewModel } from '../visualization/graph-view-model';

export class GraphNavigationEngine {

    /** Every node connected to the selected node (either direction). Useful for hover/focus highlighting. */
    getConnectedNodes(graph: GraphViewModel, nodeId: number): GraphNode[] {
        const ids = graph.adjacency.get(nodeId) ?? [];
        return graph.nodes.filter(n => ids.includes(n.id));
    }

    /** Every edge touching the node. */
    getConnectedEdges(graph: GraphViewModel, nodeId: number): GraphEdge[] {
        return [
            ...(graph.incomingEdges.get(nodeId) ?? []),
            ...(graph.outgoingEdges.get(nodeId) ?? [])
        ];
    }

    getParents(graph: GraphViewModel, nodeId: number): GraphNode[] {
        const ids = graph.incoming.get(nodeId) ?? [];
        return graph.nodes.filter(n => ids.includes(n.id));
    }

    getChildren(graph: GraphViewModel, nodeId: number): GraphNode[] {
        const ids = graph.outgoing.get(nodeId) ?? [];
        return graph.nodes.filter(n => ids.includes(n.id));
    }

    /** Breadth-first traversal following outgoing edges. */
    traverseBreadthFirst(graph: GraphViewModel, startId: number): GraphNode[] {

        const queue: number[] = [startId];
        const visited = new Set<number>([startId]);
        const result: GraphNode[] = [];

        while (queue.length) {

            const id = queue.shift()!;
            const node = graph.nodeMap.get(id);
            if (node) result.push(node);

            for (const childId of graph.outgoing.get(id) ?? []) {
                if (!visited.has(childId)) {
                    visited.add(childId);
                    queue.push(childId);
                }
            }
        }

        return result;
    }

    /** Depth-first traversal following outgoing edges. */
    traverseDepthFirst(graph: GraphViewModel, startId: number): GraphNode[] {

        const result: GraphNode[] = [];
        const visited = new Set<number>();

        this.depthSearch(graph, startId, visited, result);

        return result;
    }

    /** Every ancestor, following incoming edges. */
    getAncestors(graph: GraphViewModel, nodeId: number): GraphNode[] {
        const visited = new Set<number>();
        this.collect(graph, nodeId, graph.incoming, visited);
        return graph.nodes.filter(n => visited.has(n.id));
    }

    /** Every descendant, following outgoing edges. */
    getDescendants(graph: GraphViewModel, nodeId: number): GraphNode[] {
        const visited = new Set<number>();
        this.collect(graph, nodeId, graph.outgoing, visited);
        return graph.nodes.filter(n => visited.has(n.id));
    }

    /**
     * Shortest path via BFS over undirected adjacency.
     *
     * Fixed: the previous version only marked a node visited when it was
     * DEQUEUED, so the same node could be pushed onto the queue many
     * times via different partial paths before any of them got marked —
     * turning what should be a linear BFS into something combinatorial
     * on dense graphs. Now nodes are marked visited at enqueue time.
     */
    findShortestPath(graph: GraphViewModel, startId: number, targetId: number): number[] {

        if (startId === targetId) {
            return graph.nodeMap.has(startId) ? [startId] : [];
        }

        const queue: number[][] = [[startId]];
        const visited = new Set<number>([startId]);

        while (queue.length) {

            const path = queue.shift()!;
            const current = path[path.length - 1];

            for (const neighborId of graph.adjacency.get(current) ?? []) {

                if (visited.has(neighborId)) {
                    continue;
                }

                const nextPath = [...path, neighborId];

                if (neighborId === targetId) {
                    return nextPath;
                }

                visited.add(neighborId);
                queue.push(nextPath);
            }
        }

        return [];
    }

    /** Node with the most direct relationships (highest degree). */
    getMostConnectedNode(graph: GraphViewModel): GraphNode | undefined {

        let winner: GraphNode | undefined;
        let max = -1;

        for (const node of graph.nodes) {
            const degree = (graph.adjacency.get(node.id) ?? []).length;
            if (degree > max) {
                max = degree;
                winner = node;
            }
        }

        return winner;
    }

    /**
     * Returns new node/edge arrays with the node and everything directly
     * connected to it marked selected/highlighted. Does not mutate the
     * input graph — consistent with the other analytics engines, and
     * safe to use with OnPush/signal-based change detection.
     */
    focusNode(graph: GraphViewModel, nodeId: number): { nodes: GraphNode[]; edges: GraphEdge[] } {

        const connectedEdgeIds = new Set(this.getConnectedEdges(graph, nodeId).map(e => e.id));
        const neighborIds = new Set((graph.adjacency.get(nodeId) ?? []));

        const nodes = graph.nodes.map(node => ({
            ...node,
            selected: node.id === nodeId,
            highlighted: node.id === nodeId || neighborIds.has(node.id)
        }));

        const edges = graph.edges.map(edge => ({
            ...edge,
            highlighted: connectedEdgeIds.has(edge.id)
        }));

        return { nodes, edges };
    }

    private depthSearch(graph: GraphViewModel, nodeId: number, visited: Set<number>, result: GraphNode[]): void {

        if (visited.has(nodeId)) {
            return;
        }

        visited.add(nodeId);

        const node = graph.nodeMap.get(nodeId);
        if (node) result.push(node);

        for (const childId of graph.outgoing.get(nodeId) ?? []) {
            this.depthSearch(graph, childId, visited, result);
        }
    }

    private collect(graph: GraphViewModel, nodeId: number, direction: Map<number, number[]>, visited: Set<number>): void {

        for (const nextId of direction.get(nodeId) ?? []) {
            if (!visited.has(nextId)) {
                visited.add(nextId);
                this.collect(graph, nextId, direction, visited);
            }
        }
    }
}