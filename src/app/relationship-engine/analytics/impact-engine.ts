import { Injectable } from '@angular/core';

import { GraphNode } from '../visualization/graph-node.model';
import { GraphViewModel } from '../visualization/graph-view-model';
import { buildFinishBeforeIndex, isCompletedStatus, toDueDate } from './finish-before';

export interface ImpactNode {
    node: GraphNode;
    /** Fewest finish-before steps from the analyzed item. */
    depth: number;
}

/** What waits on an item, counting only open items in the loaded graph. */
export interface ImpactAnalysis {
    source: GraphNode;
    impactedNodes: ImpactNode[];
    totalAffected: number;
    /** Steps to the furthest waiting item. */
    maxDepth: number;
    /** Sum of the recorded estimates of the waiting items, in hours. */
    estimatedHours: number;
    /** Waiting items with no recorded estimate. */
    withoutEstimate: number;
    earliestDueDate?: Date;
}

@Injectable({
    providedIn: 'root'
})
export class ImpactEngine {

    analyze(graph: GraphViewModel, sourceId: number): ImpactAnalysis {

        const source = graph.nodeMap.get(sourceId);

        if (!source) {
            throw new Error('Source node not found.');
        }

        const affected: ImpactNode[] = [];

        // Nothing waits on finished work.
        if (!isCompletedStatus(source.status)) {

            const index = buildFinishBeforeIndex(graph);
            const visited = new Set<number>([source.id]);
            const queue: ImpactNode[] = [{ node: source, depth: 0 }];

            // Breadth-first, so each item's depth is its shortest distance.
            while (queue.length) {

                const current = queue.shift()!;

                for (const { nextId } of index.get(current.node.id) ?? []) {

                    if (visited.has(nextId)) {
                        continue;
                    }

                    visited.add(nextId);

                    const next = graph.nodeMap.get(nextId)!;

                    // A finished item isn't waiting, and what waits on it isn't waiting through it.
                    if (isCompletedStatus(next.status)) {
                        continue;
                    }

                    const impacted = { node: next, depth: current.depth + 1 };
                    affected.push(impacted);
                    queue.push(impacted);
                }
            }
        }

        const estimated = affected.filter(x => x.node.estimatedHours != null);
        const dueDates = affected
            .map(x => toDueDate(x.node.dueDate)?.getTime())
            .filter((time): time is number => time != null);

        return {
            source,
            impactedNodes: affected,
            totalAffected: affected.length,
            maxDepth: Math.max(0, ...affected.map(x => x.depth)),
            estimatedHours: estimated.reduce((sum, x) => sum + x.node.estimatedHours!, 0),
            withoutEstimate: affected.length - estimated.length,
            earliestDueDate: dueDates.length ? new Date(Math.min(...dueDates)) : undefined
        };
    }

    impactedIds(graph: GraphViewModel, sourceId: number): number[] {
        return this.analyze(graph, sourceId).impactedNodes.map(x => x.node.id);
    }

    /** Returns new node objects with highlighted set — does not mutate the input graph. */
    markImpacted(graph: GraphViewModel, sourceId: number): GraphNode[] {

        const impacted = new Set(this.impactedIds(graph, sourceId));

        return graph.nodes.map(node => ({
            ...node,
            highlighted: impacted.has(node.id)
        }));
    }
}
