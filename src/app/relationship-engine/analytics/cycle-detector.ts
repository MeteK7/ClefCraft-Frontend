import { GraphEdge } from '../visualization/graph-edge.model';
import { GraphNode } from '../visualization/graph-node.model';
import { GraphViewModel } from '../visualization/graph-view-model';

export interface RelationshipCycle {

    /**
     * Node ids participating in the cycle.
     * Example:
     * 12 -> 7 -> 19 -> 12
     */
    nodeIds: number[];

    /**
     * Human readable titles.
     */
    nodeTitles: string[];

    /**
     * Number of nodes.
     */
    size: number;

}

export class CycleDetector {

    /**
     * Finds every circular dependency inside the graph.
     */
    public detectCycles(
        graph: GraphViewModel
    ): RelationshipCycle[] {

        const visited = new Set<number>();
        const recursionStack = new Set<number>();

        const cycles: RelationshipCycle[] = [];
        const uniqueCycles = new Set<string>();

        for (const node of graph.nodes) {

            this.visit(
                graph,
                node.id,
                [],
                visited,
                recursionStack,
                cycles,
                uniqueCycles
            );

        }

        return cycles;

    }

    /**
     * Returns true if graph contains any cycle.
     */
    public hasCycles(
        graph: GraphViewModel
    ): boolean {

        return this.detectCycles(graph).length > 0;

    }

    /**
     * Returns first cycle only.
     */
    public findFirstCycle(
        graph: GraphViewModel
    ): RelationshipCycle | null {

        const cycles = this.detectCycles(graph);

        return cycles.length
            ? cycles[0]
            : null;

    }

    /**
     * Detects self dependency.
     */
    public findSelfReferences(
        graph: GraphViewModel
    ): GraphNode[] {

        const ids = graph.edges
            .filter(edge => edge.sourceId === edge.targetId)
            .map(edge => edge.sourceId);

        return graph.nodes.filter(node =>
            ids.includes(node.id));

    }

    /**
     * Returns nodes involved in any cycle.
     */
    public getCycleNodes(
        graph: GraphViewModel
    ): GraphNode[] {

        const ids = new Set<number>();

        this.detectCycles(graph)
            .forEach(cycle => {

                cycle.nodeIds.forEach(id => ids.add(id));

            });

        return graph.nodes.filter(node =>
            ids.has(node.id));

    }

    /**
     * Marks graph so UI can render cycles in red.
     */
    public highlightCycles(
        graph: GraphViewModel
    ): void {

        graph.nodes.forEach(node => {

            node.highlighted = false;

        });

        graph.edges.forEach(edge => {

            edge.highlighted = false;

        });

        const cycles = this.detectCycles(graph);

        for (const cycle of cycles) {

            for (const id of cycle.nodeIds) {

                const node = graph.nodes.find(n => n.id === id);

                if (node) {

                    node.highlighted = true;

                }

            }

            for (let i = 0; i < cycle.nodeIds.length - 1; i++) {

                const source = cycle.nodeIds[i];
                const target = cycle.nodeIds[i + 1];

                const edge = graph.edges.find(e =>
                    e.sourceId === source &&
                    e.targetId === target);

                if (edge) {

                    edge.highlighted = true;

                }

            }

        }

    }

    /**
     * DFS
     */
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

                        nodeTitles: normalized
                            .map(id => this.getTitle(graph, id)),

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

        const children = this.getChildren(
            graph,
            nodeId
        );

        for (const child of children) {

            this.visit(
                graph,
                child.id,
                [...path, nodeId],
                visited,
                recursionStack,
                cycles,
                uniqueCycles
            );

        }

        recursionStack.delete(nodeId);

    }

    private getChildren(
        graph: GraphViewModel,
        nodeId: number
    ): GraphNode[] {

        const ids = graph.edges
            .filter(edge => edge.sourceId === nodeId)
            .map(edge => edge.targetId);

        return graph.nodes.filter(node =>
            ids.includes(node.id));

    }

    /**
     * Ensures same cycle discovered from
     * different starting nodes is only reported once.
     */
    private normalize(
        cycle: number[]
    ): number[] {

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

        const rotated = [

            ...unique.slice(minIndex),

            ...unique.slice(0, minIndex)

        ];

        rotated.push(rotated[0]);

        return rotated;

    }

    private getTitle(
        graph: GraphViewModel,
        id: number
    ): string {

        return graph.nodes.find(n => n.id === id)?.title
            ?? `#${id}`;

    }

}