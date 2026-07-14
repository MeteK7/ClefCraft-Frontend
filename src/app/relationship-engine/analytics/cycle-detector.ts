import { Injectable } from '@angular/core';
import { GraphEdge } from '../visualization/graph-edge.model';
import { GraphNode } from '../visualization/graph-node.model';
import { GraphViewModel } from '../visualization/graph-view-model';

export interface RelationshipCycle {

    /** Node ids participating in the cycle, e.g. 12 -> 7 -> 19 -> 12. */
    nodeIds: number[];

    nodeTitles: string[];

    size: number;
}

@Injectable({
    providedIn: 'root'
})

export class CycleDetector {

    /** Finds every circular dependency inside the graph. */
    detectCycles(graph: GraphViewModel): RelationshipCycle[] {

        const visited = new Set<number>();
        const recursionStack = new Set<number>();

        const cycles: RelationshipCycle[] = [];
        const uniqueCycles = new Set<string>();

        for (const node of graph.nodes) {
            this.visit(graph, node.id, [], visited, recursionStack, cycles, uniqueCycles);
        }

        return cycles;
    }

    hasCycles(graph: GraphViewModel): boolean {
        return this.detectCycles(graph).length > 0;
    }

    findFirstCycle(graph: GraphViewModel): RelationshipCycle | null {
        const cycles = this.detectCycles(graph);
        return cycles.length ? cycles[0] : null;
    }

    findSelfReferences(graph: GraphViewModel): GraphNode[] {

        const ids = graph.edges
            .filter(edge => edge.sourceId === edge.targetId)
            .map(edge => edge.sourceId);

        return graph.nodes.filter(node => ids.includes(node.id));
    }

    getCycleNodes(graph: GraphViewModel): GraphNode[] {

        const ids = new Set<number>();

        this.detectCycles(graph).forEach(cycle => {
            cycle.nodeIds.forEach(id => ids.add(id));
        });

        return graph.nodes.filter(node => ids.has(node.id));
    }

    /**
     * Returns new node/edge arrays with cyclic/highlighted set — does
     * NOT mutate the input graph. (The previous version mutated graph
     * objects in place while every other analytics engine returned new
     * arrays; that inconsistency silently breaks OnPush/signal-based
     * change detection depending on call order.)
     */
    markCycles(graph: GraphViewModel): { nodes: GraphNode[]; edges: GraphEdge[] } {

        const cycles = this.detectCycles(graph);

        const cyclicNodeIds = new Set<number>();
        const cyclicEdgeKeys = new Set<string>();

        for (const cycle of cycles) {

            cycle.nodeIds.forEach(id => cyclicNodeIds.add(id));

            for (let i = 0; i < cycle.nodeIds.length - 1; i++) {
                cyclicEdgeKeys.add(`${cycle.nodeIds[i]}->${cycle.nodeIds[i + 1]}`);
            }
        }

        const nodes = graph.nodes.map(node => ({
            ...node,
            cyclic: cyclicNodeIds.has(node.id),
            highlighted: cyclicNodeIds.has(node.id)
        }));

        const edges = graph.edges.map(edge => {
            const isCyclic = cyclicEdgeKeys.has(`${edge.sourceId}->${edge.targetId}`);
            return { ...edge, cyclic: isCyclic, highlighted: isCyclic };
        });

        return { nodes, edges };
    }

    private visit(
        graph: GraphViewModel,
        nodeId: number,
        path: number[],
        visited: Set<number>,
        recursionStack: Set<number>,
        cycles: RelationshipCycle[],
        uniqueCycles: Set<string>
    ): void {

        if (recursionStack.has(nodeId)) {

            const start = path.indexOf(nodeId);

            if (start >= 0) {

                const cycle = path.slice(start);
                cycle.push(nodeId);

                const normalized = this.normalize(cycle);
                const key = normalized.join('-');

                if (!uniqueCycles.has(key)) {
                    uniqueCycles.add(key);
                    cycles.push({
                        nodeIds: normalized,
                        nodeTitles: normalized.map(id => this.getTitle(graph, id)),
                        size: normalized.length
                    });
                }
            }

            return;
        }

        if (visited.has(nodeId)) {
            return;
        }

        visited.add(nodeId);
        recursionStack.add(nodeId);

        for (const childId of graph.outgoing.get(nodeId) ?? []) {
            this.visit(graph, childId, [...path, nodeId], visited, recursionStack, cycles, uniqueCycles);
        }

        recursionStack.delete(nodeId);
    }

    /** Ensures the same cycle discovered from different starting nodes is only reported once. */
    private normalize(cycle: number[]): number[] {

        if (cycle.length <= 1) {
            return cycle;
        }

        const unique = cycle.slice(0, cycle.length - 1);

        let minIndex = 0;
        for (let i = 1; i < unique.length; i++) {
            if (unique[i] < unique[minIndex]) {
                minIndex = i;
            }
        }

        const rotated = [...unique.slice(minIndex), ...unique.slice(0, minIndex)];
        rotated.push(rotated[0]);

        return rotated;
    }

    private getTitle(graph: GraphViewModel, id: number): string {
        return graph.nodeMap.get(id)?.title ?? `#${id}`;
    }
}