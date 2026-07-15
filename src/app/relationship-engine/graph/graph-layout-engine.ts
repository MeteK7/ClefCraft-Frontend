import { Injectable } from '@angular/core';

import { GraphViewModel } from '../visualization/graph-view-model';

@Injectable({
    providedIn: 'root'
})
export class GraphLayoutEngine {

    /** Radial distance added per hop away from the root, before crowding adjustments. */
    private readonly baseRingSpacing = 260;

    /** Minimum center-to-center spacing to keep between sibling cards sharing a ring. */
    private readonly minSiblingSpacing = 260;

    layout(graph: GraphViewModel): GraphViewModel {

        const root = graph.nodeMap.get(graph.rootNodeId);
        if (!root) {
            return graph;
        }

        root.x = 0;
        root.y = 0;

        const tree = this.buildSpanningTree(graph);
        const subtreeWeight = this.computeSubtreeWeights(tree, graph.rootNodeId);

        this.placeChildren(graph, tree, subtreeWeight, graph.rootNodeId, 0, Math.PI * 2, 1);
        this.placeUnreachableNodes(graph, tree);

        return graph;
    }

    private buildSpanningTree(graph: GraphViewModel): Map<number, number[]> {

        const children = new Map<number, number[]>();
        const visited = new Set<number>([graph.rootNodeId]);
        const queue: number[] = [graph.rootNodeId];

        while (queue.length) {

            const current = queue.shift()!;
            const neighborIds = [...(graph.adjacency.get(current) ?? [])];

            neighborIds.sort((a, b) => this.edgeTypeRank(graph, current, a) - this.edgeTypeRank(graph, current, b));

            const kids: number[] = [];

            for (const neighborId of neighborIds) {
                if (!visited.has(neighborId)) {
                    visited.add(neighborId);
                    kids.push(neighborId);
                    queue.push(neighborId);
                }
            }

            children.set(current, kids);
        }

        return children;
    }

    private edgeTypeRank(graph: GraphViewModel, a: number, b: number): number {
        const edge = (graph.outgoingEdges.get(a) ?? []).find(e => e.targetId === b)
            ?? (graph.incomingEdges.get(a) ?? []).find(e => e.sourceId === b);
        return edge?.relationType ?? 0;
    }

    /** Leaf count of each node's subtree — nodes with no children weigh 1. Drives proportional sector sizing. */
    private computeSubtreeWeights(tree: Map<number, number[]>, rootId: number): Map<number, number> {

        const weights = new Map<number, number>();

        const visit = (id: number): number => {

            const kids = tree.get(id) ?? [];

            if (!kids.length) {
                weights.set(id, 1);
                return 1;
            }

            const total = kids.reduce((sum, kidId) => sum + visit(kidId), 0);
            weights.set(id, total);
            return total;
        };

        visit(rootId);
        return weights;
    }

    private placeChildren(
        graph: GraphViewModel,
        tree: Map<number, number[]>,
        subtreeWeight: Map<number, number>,
        parentId: number,
        startAngle: number,
        endAngle: number,
        level: number
    ): void {

        const kids = tree.get(parentId) ?? [];
        if (!kids.length) {
            return;
        }

        const sectorSpan = endAngle - startAngle;
        const totalWeight = kids.reduce((sum, id) => sum + (subtreeWeight.get(id) ?? 1), 0);

        const idealRadius = level * this.baseRingSpacing;
        const circumferenceNeeded = kids.length * this.minSiblingSpacing;
        const radiusNeededForSpacing = sectorSpan > 0 ? circumferenceNeeded / sectorSpan : idealRadius;
        const radius = Math.max(idealRadius, radiusNeededForSpacing);

        let angleCursor = startAngle;

        for (const kidId of kids) {

            const weight = subtreeWeight.get(kidId) ?? 1;
            const kidSpan = sectorSpan * (weight / totalWeight);
            const kidAngle = angleCursor + kidSpan / 2;

            const kid = graph.nodeMap.get(kidId);

            if (kid) {
                kid.x = Math.cos(kidAngle) * radius;
                kid.y = Math.sin(kidAngle) * radius;
            }

            this.placeChildren(graph, tree, subtreeWeight, kidId, angleCursor, angleCursor + kidSpan, level + 1);

            angleCursor += kidSpan;
        }
    }

    private placeUnreachableNodes(graph: GraphViewModel, tree: Map<number, number[]>): void {

        const placed = new Set<number>([graph.rootNodeId]);
        tree.forEach(kids => kids.forEach(id => placed.add(id)));

        const stray = graph.nodes.filter(n => !placed.has(n.id));
        if (!stray.length) {
            return;
        }

        const radius = this.baseRingSpacing * 5;
        const step = (Math.PI * 2) / stray.length;

        stray.forEach((node, index) => {
            node.x = Math.cos(step * index) * radius;
            node.y = Math.sin(step * index) * radius;
        });
    }
}