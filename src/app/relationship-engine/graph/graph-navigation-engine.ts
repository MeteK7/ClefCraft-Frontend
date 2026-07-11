import { GraphNode } from '../visualization/graph-node.model';
import { GraphEdge } from '../visualization/graph-edge.model';
import { GraphViewModel } from '../visualization/graph-view-model';

export class GraphNavigationEngine {

    /**
     * Returns every node connected to the selected node.
     * Useful for hover/focus highlighting.
     */
    public getConnectedNodes(
        graph: GraphViewModel,
        nodeId: number
    ): GraphNode[] {

        const connectedIds = new Set<number>();

        for (const edge of graph.edges) {

            if (edge.sourceId === nodeId) {
                connectedIds.add(edge.targetId);
            }

            if (edge.targetId === nodeId) {
                connectedIds.add(edge.sourceId);
            }

        }

        return graph.nodes.filter(n => connectedIds.has(n.id));

    }

    /**
     * Returns all edges touching the node.
     */
    public getConnectedEdges(
        graph: GraphViewModel,
        nodeId: number
    ): GraphEdge[] {

        return graph.edges.filter(edge =>

            edge.sourceId === nodeId ||
            edge.targetId === nodeId

        );

    }

    /**
     * Returns immediate parents.
     */
    public getParents(
        graph: GraphViewModel,
        nodeId: number
    ): GraphNode[] {

        const ids = graph.edges
            .filter(e => e.targetId === nodeId)
            .map(e => e.sourceId);

        return graph.nodes.filter(n => ids.includes(n.id));

    }

    /**
     * Returns immediate children.
     */
    public getChildren(
        graph: GraphViewModel,
        nodeId: number
    ): GraphNode[] {

        const ids = graph.edges
            .filter(e => e.sourceId === nodeId)
            .map(e => e.targetId);

        return graph.nodes.filter(n => ids.includes(n.id));

    }

    /**
     * Breadth-first traversal.
     */
    public traverseBreadthFirst(
        graph: GraphViewModel,
        startId: number
    ): GraphNode[] {

        const queue: number[] = [startId];
        const visited = new Set<number>();

        const result: GraphNode[] = [];

        while (queue.length > 0) {

            const id = queue.shift()!;

            if (visited.has(id)) {
                continue;
            }

            visited.add(id);

            const node = graph.nodes.find(n => n.id === id);

            if (node) {
                result.push(node);
            }

            const children = this.getChildren(graph, id);

            for (const child of children) {

                if (!visited.has(child.id)) {
                    queue.push(child.id);
                }

            }

        }

        return result;

    }

    /**
     * Depth-first traversal.
     */
    public traverseDepthFirst(
        graph: GraphViewModel,
        startId: number
    ): GraphNode[] {

        const result: GraphNode[] = [];
        const visited = new Set<number>();

        this.depthSearch(
            graph,
            startId,
            visited,
            result
        );

        return result;

    }

    /**
     * Returns every ancestor.
     */
    public getAncestors(
        graph: GraphViewModel,
        nodeId: number
    ): GraphNode[] {

        const visited = new Set<number>();

        this.collectParents(
            graph,
            nodeId,
            visited
        );

        return graph.nodes.filter(n => visited.has(n.id));

    }

    /**
     * Returns every descendant.
     */
    public getDescendants(
        graph: GraphViewModel,
        nodeId: number
    ): GraphNode[] {

        const visited = new Set<number>();

        this.collectChildren(
            graph,
            nodeId,
            visited
        );

        return graph.nodes.filter(n => visited.has(n.id));

    }

    /**
     * Returns shortest path using BFS.
     */
    public findShortestPath(
        graph: GraphViewModel,
        startId: number,
        targetId: number
    ): number[] {

        const queue: number[][] = [[startId]];
        const visited = new Set<number>();

        while (queue.length > 0) {

            const path = queue.shift()!;
            const current = path[path.length - 1];

            if (current === targetId) {
                return path;
            }

            if (visited.has(current)) {
                continue;
            }

            visited.add(current);

            const neighbours = this.getConnectedNodes(
                graph,
                current
            );

            for (const node of neighbours) {

                if (!visited.has(node.id)) {

                    queue.push([
                        ...path,
                        node.id
                    ]);

                }

            }

        }

        return [];

    }

    /**
     * Returns graph center node
     * (largest number of direct relationships).
     */
    public getMostConnectedNode(
        graph: GraphViewModel
    ): GraphNode | undefined {

        let winner: GraphNode | undefined;
        let max = -1;

        for (const node of graph.nodes) {

            const degree = this.getConnectedEdges(
                graph,
                node.id
            ).length;

            if (degree > max) {

                max = degree;
                winner = node;

            }

        }

        return winner;

    }

    /**
     * Marks a node and everything directly connected.
     * UI can use this for focus mode.
     */
    public focusNode(
        graph: GraphViewModel,
        nodeId: number
    ): void {

        graph.nodes.forEach(node => {

            node.selected = false;
            node.highlighted = false;

        });

        graph.edges.forEach(edge => edge.highlighted = false);

        const selected = graph.nodes.find(n => n.id === nodeId);

        if (!selected) {
            return;
        }

        selected.selected = true;
        selected.highlighted = true;

        const edges = this.getConnectedEdges(
            graph,
            nodeId
        );

        for (const edge of edges) {

            edge.highlighted = true;

        }

        const neighbours = this.getConnectedNodes(
            graph,
            nodeId
        );

        for (const node of neighbours) {

            node.highlighted = true;

        }

    }

    private depthSearch(
        graph: GraphViewModel,
        nodeId: number,
        visited: Set<number>,
        result: GraphNode[]
    ): void {

        if (visited.has(nodeId)) {
            return;
        }

        visited.add(nodeId);

        const node = graph.nodes.find(n => n.id === nodeId);

        if (node) {
            result.push(node);
        }

        const children = this.getChildren(
            graph,
            nodeId
        );

        for (const child of children) {

            this.depthSearch(
                graph,
                child.id,
                visited,
                result
            );

        }

    }

    private collectParents(
        graph: GraphViewModel,
        nodeId: number,
        visited: Set<number>
    ): void {

        const parents = this.getParents(
            graph,
            nodeId
        );

        for (const parent of parents) {

            if (!visited.has(parent.id)) {

                visited.add(parent.id);

                this.collectParents(
                    graph,
                    parent.id,
                    visited
                );

            }

        }

    }

    private collectChildren(
        graph: GraphViewModel,
        nodeId: number,
        visited: Set<number>
    ): void {

        const children = this.getChildren(
            graph,
            nodeId
        );

        for (const child of children) {

            if (!visited.has(child.id)) {

                visited.add(child.id);

                this.collectChildren(
                    graph,
                    child.id,
                    visited
                );

            }

        }

    }

}