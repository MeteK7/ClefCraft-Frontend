import { Injectable } from '@angular/core';

import { GraphNode } from '../visualization/graph-node.model';
import { GraphViewModel } from '../visualization/graph-view-model';

export interface ImpactNode {
    node: GraphNode;
    /** Number of dependency hops from the selected item. */
    depth: number;
}

export interface ImpactAnalysis {
    source: GraphNode;
    impactedNodes: ImpactNode[];
    totalAffected: number;
    maxDepth: number;
    /** Overall severity, 0-100. */
    score: number;
    estimatedHours: number;
    storyPoints: number;
    milestones: number;
    completed: number;
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

        const visited = new Set<number>([source.id]);
        const impacted: ImpactNode[] = [];
        const queue: ImpactNode[] = [{ node: source, depth: 0 }];

        while (queue.length) {

            const current = queue.shift()!;
            impacted.push(current);

            for (const nextId of graph.outgoing.get(current.node.id) ?? []) {

                if (visited.has(nextId)) {
                    continue;
                }

                visited.add(nextId);

                const next = graph.nodeMap.get(nextId);
                if (!next) {
                    continue;
                }

                queue.push({ node: next, depth: current.depth + 1 });
            }
        }

        const affected = impacted.slice(1);

        const estimatedHours = affected.reduce((sum, x) => sum + (x.node.estimatedHours ?? 0), 0);
        const storyPoints = affected.reduce((sum, x) => sum + (x.node.storyPoints ?? 0), 0);
        const milestones = affected.filter(x => x.node.isMilestone).length;
        const completed = affected.filter(x => x.node.completed).length;
        const maxDepth = Math.max(0, ...affected.map(x => x.depth));

        const score = this.calculateImpactScore(affected.length, maxDepth, estimatedHours, storyPoints, milestones);

        return {
            source,
            impactedNodes: affected,
            totalAffected: affected.length,
            maxDepth,
            estimatedHours,
            storyPoints,
            milestones,
            completed,
            score
        };
    }

    private calculateImpactScore(affected: number, depth: number, hours: number, storyPoints: number, milestones: number): number {

        let score = 0;
        score += affected * 5;
        score += depth * 8;
        score += hours * 0.5;
        score += storyPoints * 2;
        score += milestones * 20;

        return Math.min(100, Math.round(score));
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