import { Injectable } from '@angular/core';

import { GraphNode } from '../visualization/graph-node.model';
import { GraphEdge } from '../visualization/graph-edge.model';

export interface ImpactNode {

    node: GraphNode;

    /**
     * Number of dependency hops
     * from the selected item.
     */
    depth: number;

}

export interface ImpactAnalysis {

    /**
     * Selected node.
     */
    source: GraphNode;

    /**
     * Every affected node.
     */
    impactedNodes: ImpactNode[];

    /**
     * Total affected.
     */
    totalAffected: number;

    /**
     * Longest dependency distance.
     */
    maxDepth: number;

    /**
     * Overall severity (0-100)
     */
    score: number;

    /**
     * Estimated blocked work.
     */
    estimatedHours: number;

    /**
     * Estimated blocked story points.
     */
    storyPoints: number;

    /**
     * Number of affected milestones.
     */
    milestones: number;

    /**
     * Number of affected completed tasks.
     */
    completed: number;

}
@Injectable({
    providedIn: 'root'
})
export class ImpactEngine {

    analyze(
        sourceId: number,
        nodes: GraphNode[],
        edges: GraphEdge[]
    ): ImpactAnalysis {

        const nodeMap = new Map<number, GraphNode>();

        nodes.forEach(n => nodeMap.set(n.id, n));

        const source = nodeMap.get(sourceId);

        if (!source) {

            throw new Error('Source node not found.');

        }

        const outgoing = new Map<number, number[]>();

        nodes.forEach(node => {

            outgoing.set(node.id, []);

        });

        edges.forEach(edge => {

            outgoing.get(edge.sourceId)?.push(edge.targetId);

        });

        const visited = new Set<number>();

        const impacted: ImpactNode[] = [];

        const queue: ImpactNode[] = [];

        queue.push({
            node: source,
            depth: 0
        });

        visited.add(source.id);

        while (queue.length) {

            const current = queue.shift()!;

            impacted.push(current);

            const neighbours =
                outgoing.get(current.node.id) ?? [];

            neighbours.forEach(nextId => {

                if (visited.has(nextId))
                    return;

                visited.add(nextId);

                const next = nodeMap.get(nextId);

                if (!next)
                    return;

                queue.push({

                    node: next,

                    depth: current.depth + 1

                });

            });

        }

        const affected = impacted.slice(1);

        const estimatedHours =
            affected.reduce(
                (sum, x) =>
                    sum + (x.node.estimatedHours ?? 0),
                0
            );

        const storyPoints =
            affected.reduce(
                (sum, x) =>
                    sum + (x.node.storyPoints ?? 0),
                0
            );

        const milestones =
            affected.filter(x => x.node.isMilestone).length;

        const completed =
            affected.filter(x => x.node.completed).length;

        const maxDepth =
            Math.max(
                0,
                ...affected.map(x => x.depth)
            );

        const score =
            this.calculateImpactScore(
                affected.length,
                maxDepth,
                estimatedHours,
                storyPoints,
                milestones
            );

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

    private calculateImpactScore(

        affected: number,

        depth: number,

        hours: number,

        storyPoints: number,

        milestones: number

    ): number {

        let score = 0;

        score += affected * 5;

        score += depth * 8;

        score += hours * 0.5;

        score += storyPoints * 2;

        score += milestones * 20;

        return Math.min(
            100,
            Math.round(score)
        );

    }

    /**
     * Returns only ids.
     */
    impactedIds(
        sourceId: number,
        nodes: GraphNode[],
        edges: GraphEdge[]
    ): number[] {

        return this
            .analyze(sourceId, nodes, edges)
            .impactedNodes
            .map(x => x.node.id);

    }

    /**
     * Highlight affected nodes.
     */
    markImpacted(
        sourceId: number,
        nodes: GraphNode[],
        edges: GraphEdge[]
    ): GraphNode[] {

        const impacted =
            new Set(
                this.impactedIds(
                    sourceId,
                    nodes,
                    edges
                )
            );

        return nodes.map(node => ({
            ...node,
            highlighted:
                impacted.has(node.id)
        }));

    }

}