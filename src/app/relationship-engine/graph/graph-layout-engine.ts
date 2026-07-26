import { Injectable } from '@angular/core';

import { GraphViewModel } from '../visualization/graph-view-model';

@Injectable({
    providedIn: 'root'
})
export class GraphLayoutEngine {

    /** Vertical distance between adjacent rows (hierarchy levels). Fixed, so every row lines up consistently. */
    private readonly rowSpacing = 200;

    /** Minimum center-to-center horizontal spacing between neighbors sharing a row. */
    private readonly minColSpacing = 260;

    /** Barycenter sweeps to run. Alternates direction each pass; diminishing returns past ~8 on graphs this size. */
    private readonly crossingReductionPasses = 8;

    layout(graph: GraphViewModel): GraphViewModel {

        const root = graph.nodeMap.get(graph.rootNodeId);
        if (!root) {
            return graph;
        }

        const tree = this.buildSpanningTree(graph);
        const rows = this.assignRows(graph, tree);

        this.minimizeCrossings(graph, rows);
        this.assignCoordinates(graph, rows);
        this.placeUnreachableNodes(graph, rows);

        return graph;
    }

    // =====================================================================
    // Row (level) assignment
    // =====================================================================

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

    private assignRows(graph: GraphViewModel, tree: Map<number, number[]>): number[][] {

        const levelOf = new Map<number, number>([[graph.rootNodeId, 0]]);
        const rows: number[][] = [[graph.rootNodeId]];

        const queue: number[] = [graph.rootNodeId];

        while (queue.length) {

            const current = queue.shift()!;
            const level = levelOf.get(current)!;

            for (const childId of tree.get(current) ?? []) {

                levelOf.set(childId, level + 1);

                if (!rows[level + 1]) {
                    rows[level + 1] = [];
                }
                rows[level + 1].push(childId);

                queue.push(childId);
            }
        }

        return rows;
    }

    // =====================================================================
    // Crossing minimization (barycenter method)
    // =====================================================================

    private minimizeCrossings(graph: GraphViewModel, rows: number[][]): void {

        if (rows.length <= 1) {
            return;
        }

        const positionInRow = new Map<number, number>();
        const rebuildPositions = () => {
            positionInRow.clear();
            rows.forEach(row => row.forEach((id, idx) => positionInRow.set(id, idx)));
        };
        rebuildPositions();

        for (let pass = 0; pass < this.crossingReductionPasses; pass++) {

            const downward = pass % 2 === 0;

            if (downward) {
                for (let level = 1; level < rows.length; level++) {
                    this.reorderRowByBarycenter(graph, rows[level], rows[level - 1], positionInRow);
                    rebuildPositions();
                }
            } else {
                for (let level = rows.length - 2; level >= 0; level--) {
                    this.reorderRowByBarycenter(graph, rows[level], rows[level + 1], positionInRow);
                    rebuildPositions();
                }
            }
        }
    }

    private reorderRowByBarycenter(
        graph: GraphViewModel,
        row: number[],
        referenceRow: number[],
        positionInRow: Map<number, number>
    ): void {

        const refPos = new Map<number, number>();
        referenceRow.forEach((id, idx) => refPos.set(id, idx));

        const barycenter = (nodeId: number): number => {

            const neighbors = (graph.adjacency.get(nodeId) ?? []).filter(n => refPos.has(n));

            if (!neighbors.length) {
                return positionInRow.get(nodeId) ?? 0;
            }

            const sum = neighbors.reduce((s, n) => s + (refPos.get(n) ?? 0), 0);
            return sum / neighbors.length;
        };

        const scored = row.map(id => ({ id, score: barycenter(id) }));

        // Stable sort: ties keep their existing relative order instead of
        // jittering between passes.
        scored.sort((a, b) => a.score - b.score);

        row.splice(0, row.length, ...scored.map(s => s.id));
    }

    // =====================================================================
    // Coordinate assignment
    // =====================================================================

    private assignCoordinates(graph: GraphViewModel, rows: number[][]): void {

        rows.forEach((row, level) => {

            if (!row.length) return;

            const spacing = this.computeRowSpacing(graph, row);
            const totalWidth = (row.length - 1) * spacing;
            const startX = -totalWidth / 2;

            row.forEach((id, idx) => {
                const node = graph.nodeMap.get(id);
                if (!node) return;
                node.x = startX + idx * spacing;
                node.y = level * this.rowSpacing;
            });
        });
    }

    /** Widest card in the row drives spacing, so cards never overlap regardless of title length / card size. */
    private computeRowSpacing(graph: GraphViewModel, nodeIds: number[]): number {

        let widest = 0;
        for (const id of nodeIds) {
            const node = graph.nodeMap.get(id);
            if (node) widest = Math.max(widest, node.width);
        }

        return Math.max(this.minColSpacing, widest + 60);
    }

    /** Nodes unreachable from the root (no path through the spanning tree) get their own row below everything else, evenly spaced. */
    private placeUnreachableNodes(graph: GraphViewModel, rows: number[][]): void {

        const placed = new Set<number>();
        rows.forEach(row => row.forEach(id => placed.add(id)));

        const stray = graph.nodes.filter(n => !placed.has(n.id));
        if (!stray.length) {
            return;
        }

        const level = rows.length;
        const strayIds = stray.map(n => n.id);
        const spacing = this.computeRowSpacing(graph, strayIds);
        const totalWidth = (stray.length - 1) * spacing;
        const startX = -totalWidth / 2;

        stray.forEach((node, idx) => {
            node.x = startX + idx * spacing;
            node.y = level * this.rowSpacing;
        });
    }
}