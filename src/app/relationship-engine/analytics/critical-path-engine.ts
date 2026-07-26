import { Injectable } from '@angular/core';

import { GraphNode } from '../visualization/graph-node.model';
import { GraphViewModel } from '../visualization/graph-view-model';

export interface CriticalPathResult {

    path: number[];
    nodes: GraphNode[];
    duration: number;
    excludedCyclicNodeIds: number[];
}

@Injectable({
    providedIn: 'root'
})
export class CriticalPathEngine {

    /** Returns the longest dependency chain by duration. */
    findCriticalPath(graph: GraphViewModel): CriticalPathResult {

        if (!graph.nodes.length) {
            return { path: [], nodes: [], duration: 0, excludedCyclicNodeIds: [] };
        }

        const remaining = new Map<number, number>();
        graph.nodes.forEach(n => remaining.set(n.id, (graph.incoming.get(n.id) ?? []).length));

        const queue: number[] = [];
        remaining.forEach((count, id) => { if (count === 0) queue.push(id); });

        const order: number[] = [];

        while (queue.length) {

            const current = queue.shift()!;
            order.push(current);

            for (const next of graph.outgoing.get(current) ?? []) {
                const count = (remaining.get(next) ?? 0) - 1;
                remaining.set(next, count);
                if (count === 0) {
                    queue.push(next);
                }
            }
        }

        const orderedSet = new Set(order);
        const excludedCyclicNodeIds = graph.nodes
            .map(n => n.id)
            .filter(id => !orderedSet.has(id));

        if (!order.length) {
            // Every node is part of a cycle — nothing acyclic to report.
            return { path: [], nodes: [], duration: 0, excludedCyclicNodeIds };
        }

        const distance = new Map<number, number>();
        const previous = new Map<number, number>();

        order.forEach(id => distance.set(id, this.duration(graph.nodeMap.get(id)!)));

        order.forEach(id => {
            for (const next of graph.outgoing.get(id) ?? []) {

                if (!distance.has(next)) {
                    // next is excluded (part of a cycle) — skip it.
                    continue;
                }

                const candidate = (distance.get(id) ?? 0) + this.duration(graph.nodeMap.get(next)!);

                if (candidate > (distance.get(next) ?? 0)) {
                    distance.set(next, candidate);
                    previous.set(next, id);
                }
            }
        });

        let endNode = order[0];
        order.forEach(id => {
            if ((distance.get(id) ?? 0) > (distance.get(endNode) ?? 0)) {
                endNode = id;
            }
        });

        const path: number[] = [];
        let current: number | undefined = endNode;

        while (current !== undefined) {
            path.unshift(current);
            current = previous.get(current);
        }

        return {
            path,
            nodes: path.map(id => graph.nodeMap.get(id)!).filter(Boolean),
            duration: distance.get(endNode) ?? 0,
            excludedCyclicNodeIds
        };
    }

    getCriticalIds(graph: GraphViewModel): number[] {
        return this.findCriticalPath(graph).path;
    }

    /** Returns new node objects with critical/highlighted set — does not mutate the input graph. */
    markCriticalNodes(graph: GraphViewModel): GraphNode[] {

        const critical = new Set(this.getCriticalIds(graph));

        return graph.nodes.map(node => ({
            ...node,
            critical: critical.has(node.id),
            highlighted: critical.has(node.id)
        }));
    }

    private duration(node: GraphNode): number {
        return node.estimatedHours ?? node.storyPoints ?? 1;
    }
}