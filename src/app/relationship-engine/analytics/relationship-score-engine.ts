import { Injectable } from '@angular/core';

import { GraphNode } from '../visualization/graph-node.model';
import { GraphViewModel } from '../visualization/graph-view-model';

export interface RelationshipScore {
    nodeId: number;
    score: number;
    inbound: number;
    outbound: number;
    degree: number;
    dependencyWeight: number;
    influence: number;
    risk: number;
}

@Injectable({
    providedIn: 'root'
})
export class RelationshipScoreEngine {

    calculateScores(graph: GraphViewModel): RelationshipScore[] {

        return graph.nodes.map(node => {

            const inbound = (graph.incoming.get(node.id) ?? []).length;
            const outbound = (graph.outgoing.get(node.id) ?? []).length;
            const degree = inbound + outbound;

            const dependencyWeight = this.computeDependencyWeight(inbound, outbound);
            const influence = this.computeInfluence(outbound, degree);
            const risk = this.computeRisk(node, inbound, outbound);

            const score = this.normalize(dependencyWeight + influence + risk);

            return { nodeId: node.id, score, inbound, outbound, degree, dependencyWeight, influence, risk };
        });
    }

    sortDescending(scores: RelationshipScore[]): RelationshipScore[] {
        return [...scores].sort((a, b) => b.score - a.score);
    }

    topNodes(scores: RelationshipScore[], limit = 10): RelationshipScore[] {
        return this.sortDescending(scores).slice(0, limit);
    }

    private computeDependencyWeight(inbound: number, outbound: number): number {
        return inbound * 8 + outbound * 6;
    }

    private computeInfluence(outbound: number, degree: number): number {
        return outbound * 5 + degree * 2;
    }

    private computeRisk(node: GraphNode, inbound: number, outbound: number): number {

        let score = 0;

        score += inbound * 4;

        if (node.isMilestone) score += 25;
        if (node.completed) score -= 8;
        if (node.estimatedHours) score += Math.min(20, node.estimatedHours);
        if (node.storyPoints) score += node.storyPoints * 2;
        if (outbound > 5) score += 12;

        return score;
    }

    private normalize(score: number): number {
        return Math.max(0, Math.min(100, Math.round(score)));
    }
}