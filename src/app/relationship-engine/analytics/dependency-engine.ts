import { GraphNode } from '../visualization/graph-node.model';
import { GraphEdge } from '../visualization/graph-edge.model';
import { GraphViewModel } from '../visualization/graph-view-model';

export interface DependencySummary {

    nodeId: number;

    prerequisites: GraphNode[];
    dependents: GraphNode[];

    transitivePrerequisites: GraphNode[];
    transitiveDependents: GraphNode[];

    canStart: boolean;
    dependencyDepth: number;
    impactSize: number;

    /**
     * True if this node sits inside a dependency cycle. When true,
     * dependencyDepth is meaningless (see calculateAllDepths) and callers
     * should defer to CycleDetector for the actual cycle membership.
     */
    inCycle: boolean;
}

/**
 * Plain, framework-independent class — no Angular DI. Every method takes
 * a GraphViewModel and reads its precomputed incoming/outgoing index
 * instead of filtering graph.edges, so a call costs O(1) per neighbor
 * lookup rather than O(E) per call. This matters once graphs run into
 * the thousands of nodes this engine is meant to scale to.
 */
export class DependencyEngine {

    analyze(graph: GraphViewModel, nodeId: number): DependencySummary {

        const prerequisites = this.getImmediatePrerequisites(graph, nodeId);
        const dependents = this.getImmediateDependents(graph, nodeId);

        const transitivePrerequisites = this.collect(graph, nodeId, graph.incoming);
        const transitiveDependents = this.collect(graph, nodeId, graph.outgoing);

        const depthMap = this.calculateAllDepths(graph);

        return {
            nodeId,
            prerequisites,
            dependents,
            transitivePrerequisites,
            transitiveDependents,
            canStart: prerequisites.length === 0,
            dependencyDepth: depthMap.get(nodeId) ?? 0,
            impactSize: transitiveDependents.length,
            inCycle: !depthMap.has(nodeId)
        };
    }

    getImmediatePrerequisites(graph: GraphViewModel, nodeId: number): GraphNode[] {
        return (graph.incoming.get(nodeId) ?? [])
            .map(id => graph.nodeMap.get(id))
            .filter((n): n is GraphNode => !!n);
    }

    getImmediateDependents(graph: GraphViewModel, nodeId: number): GraphNode[] {
        return (graph.outgoing.get(nodeId) ?? [])
            .map(id => graph.nodeMap.get(id))
            .filter((n): n is GraphNode => !!n);
    }

    getAllPrerequisites(graph: GraphViewModel, nodeId: number): GraphNode[] {
        return this.collect(graph, nodeId, graph.incoming);
    }

    getAllDependents(graph: GraphViewModel, nodeId: number): GraphNode[] {
        return this.collect(graph, nodeId, graph.outgoing);
    }

    getRootTasks(graph: GraphViewModel): GraphNode[] {
        return graph.nodes.filter(n => (graph.incoming.get(n.id) ?? []).length === 0);
    }

    getLeafTasks(graph: GraphViewModel): GraphNode[] {
        return graph.nodes.filter(n => (graph.outgoing.get(n.id) ?? []).length === 0);
    }

    /**
     * Longest-prerequisite-chain depth for every node, computed in a
     * single O(V + E) topological (Kahn's algorithm) pass.
     *
     * The previous implementation recursed per node with no memoization:
     * on a diamond-shaped DAG (two paths converging on one ancestor —
     * extremely common in real dependency graphs) the same ancestor gets
     * revisited exponentially many times. rankByDepth/rankByImpact then
     * called that once per node on top, making the whole ranking
     * effectively unusable past a few hundred nodes.
     *
     * Nodes inside a cycle never reach in-degree 0 in Kahn's algorithm,
     * so they're intentionally left out of the returned map rather than
     * silently reported as depth 0 — check `.has(nodeId)` (see `inCycle`
     * on DependencySummary) before trusting a depth value.
     */
    calculateAllDepths(graph: GraphViewModel): Map<number, number> {

        const remaining = new Map<number, number>();
        graph.nodes.forEach(n => remaining.set(n.id, (graph.incoming.get(n.id) ?? []).length));

        const queue: number[] = [];
        remaining.forEach((count, id) => { if (count === 0) queue.push(id); });

        const depth = new Map<number, number>();
        queue.forEach(id => depth.set(id, 0));

        while (queue.length) {

            const current = queue.shift()!;
            const currentDepth = depth.get(current) ?? 0;

            for (const next of graph.outgoing.get(current) ?? []) {

                depth.set(next, Math.max(depth.get(next) ?? 0, currentDepth + 1));

                const count = (remaining.get(next) ?? 0) - 1;
                remaining.set(next, count);

                if (count === 0) {
                    queue.push(next);
                }
            }
        }

        return depth;
    }

    calculateDepth(graph: GraphViewModel, nodeId: number): number {
        return this.calculateAllDepths(graph).get(nodeId) ?? 0;
    }

    rankByImpact(graph: GraphViewModel): GraphNode[] {
        const impactCache = new Map<number, number>();
        graph.nodes.forEach(n => impactCache.set(n.id, this.getAllDependents(graph, n.id).length));
        return [...graph.nodes].sort((a, b) => (impactCache.get(b.id) ?? 0) - (impactCache.get(a.id) ?? 0));
    }

    rankByDepth(graph: GraphViewModel): GraphNode[] {
        const depth = this.calculateAllDepths(graph);
        return [...graph.nodes].sort((a, b) => (depth.get(b.id) ?? 0) - (depth.get(a.id) ?? 0));
    }

    isReady(graph: GraphViewModel, nodeId: number): boolean {
        return (graph.incoming.get(nodeId) ?? []).length === 0;
    }

    calculateImpactSize(graph: GraphViewModel, nodeId: number): number {
        return this.getAllDependents(graph, nodeId).length;
    }

    findIndependentTasks(graph: GraphViewModel): GraphNode[] {
        return graph.nodes.filter(n =>
            (graph.incoming.get(n.id) ?? []).length === 0 &&
            (graph.outgoing.get(n.id) ?? []).length === 0
        );
    }

    getDependencies(graph: GraphViewModel, nodeId: number): GraphEdge[] {
        return [
            ...(graph.incomingEdges.get(nodeId) ?? []),
            ...(graph.outgoingEdges.get(nodeId) ?? [])
        ];
    }

    /**
     * Iterative reachability walk (BFS/DFS via explicit stack — no
     * recursion, so it can't blow the call stack on a long chain) along
     * a given direction (graph.incoming for ancestors, graph.outgoing
     * for descendants). Visited-on-push, so it's safe on cyclic graphs
     * too.
     */
    private collect(graph: GraphViewModel, nodeId: number, direction: Map<number, number[]>): GraphNode[] {

        const visited = new Set<number>();
        const stack = [...(direction.get(nodeId) ?? [])];

        while (stack.length) {

            const id = stack.pop()!;

            if (visited.has(id)) {
                continue;
            }

            visited.add(id);

            for (const next of direction.get(id) ?? []) {
                if (!visited.has(next)) {
                    stack.push(next);
                }
            }
        }

        return graph.nodes.filter(n => visited.has(n.id));
    }
}