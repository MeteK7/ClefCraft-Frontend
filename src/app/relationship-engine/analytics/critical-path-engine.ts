import { Injectable } from '@angular/core';

import { GraphNode } from '../visualization/graph-node.model';
import { GraphEdge } from '../visualization/graph-edge.model';

export interface CriticalPathResult {

    /**
     * Ordered node ids.
     */
    path: number[];

    /**
     * Ordered nodes.
     */
    nodes: GraphNode[];

    /**
     * Total duration.
     */
    duration: number;

}

@Injectable({
    providedIn: 'root'
})
export class CriticalPathEngine {

    /**
     * Returns the longest dependency chain.
     */
    findCriticalPath(
        nodes: GraphNode[],
        edges: GraphEdge[]
    ): CriticalPathResult {

        if (!nodes.length) {

            return {
                path: [],
                nodes: [],
                duration: 0
            };

        }

        const nodeMap = new Map<number, GraphNode>();

        nodes.forEach(node =>
            nodeMap.set(node.id, node)
        );

        const incoming = new Map<number, number>();

        const outgoing = new Map<number, number[]>();

        nodes.forEach(node => {

            incoming.set(node.id, 0);

            outgoing.set(node.id, []);

        });

        edges.forEach(edge => {

            outgoing.get(edge.sourceId)?.push(edge.targetId);

            incoming.set(
                edge.targetId,
                (incoming.get(edge.targetId) ?? 0) + 1
            );

        });

        const queue: number[] = [];

        incoming.forEach((count, id) => {

            if (count === 0) {

                queue.push(id);

            }

        });

        const order: number[] = [];

        while (queue.length) {

            const current = queue.shift()!;

            order.push(current);

            const neighbours =
                outgoing.get(current) ?? [];

            neighbours.forEach(next => {

                const count =
                    (incoming.get(next) ?? 0) - 1;

                incoming.set(next, count);

                if (count === 0) {

                    queue.push(next);

                }

            });

        }

        const distance = new Map<number, number>();

        const previous = new Map<number, number>();

        nodes.forEach(node => {

            distance.set(node.id, this.duration(node));

        });

        order.forEach(id => {

            const neighbours =
                outgoing.get(id) ?? [];

            neighbours.forEach(next => {

                const candidate =
                    (distance.get(id) ?? 0) +
                    this.duration(nodeMap.get(next)!);

                if (
                    candidate >
                    (distance.get(next) ?? 0)
                ) {

                    distance.set(next, candidate);

                    previous.set(next, id);

                }

            });

        });

        let endNode = order[0];

        order.forEach(id => {

            if (
                (distance.get(id) ?? 0) >
                (distance.get(endNode) ?? 0)
            ) {

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

            nodes: path
                .map(id => nodeMap.get(id)!)
                .filter(Boolean),

            duration:
                distance.get(endNode) ?? 0

        };

    }

    /**
     * Returns only the ids.
     */
    getCriticalIds(
        nodes: GraphNode[],
        edges: GraphEdge[]
    ): number[] {

        return this.findCriticalPath(
            nodes,
            edges
        ).path;

    }

    /**
     * Marks nodes.
     */
    markCriticalNodes(
        nodes: GraphNode[],
        edges: GraphEdge[]
    ): GraphNode[] {

        const critical =
            new Set(
                this.getCriticalIds(nodes, edges)
            );

        return nodes.map(node => ({
            ...node,
            highlighted: critical.has(node.id)
        }));

    }

    /**
     * Estimated duration.
     */
    private duration(
        node: GraphNode
    ): number {

        return node.estimatedHours ??
               node.storyPoints ??
               1;

    }

}