import { Injectable } from '@angular/core';

import { GraphNode } from '../visualization/graph-node.model';
import { GraphEdge } from '../visualization/graph-edge.model';

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

    calculateScores(
        nodes: GraphNode[],
        edges: GraphEdge[]
    ): RelationshipScore[] {

        const incoming = new Map<number, number>();
        const outgoing = new Map<number, number>();

        nodes.forEach(node => {

            incoming.set(node.id, 0);
            outgoing.set(node.id, 0);

        });

        edges.forEach(edge => {

            outgoing.set(
                edge.sourceId,
                (outgoing.get(edge.sourceId) ?? 0) + 1
            );

            incoming.set(
                edge.targetId,
                (incoming.get(edge.targetId) ?? 0) + 1
            );

        });

        return nodes.map(node => {

            const inbound =
                incoming.get(node.id) ?? 0;

            const outbound =
                outgoing.get(node.id) ?? 0;

            const degree =
                inbound + outbound;

            const dependencyWeight =
                this.computeDependencyWeight(
                    inbound,
                    outbound
                );

            const influence =
                this.computeInfluence(
                    outbound,
                    degree
                );

            const risk =
                this.computeRisk(
                    node,
                    inbound,
                    outbound
                );

            const score =
                this.normalize(
                    dependencyWeight +
                    influence +
                    risk
                );

            return {

                nodeId: node.id,

                score,

                inbound,

                outbound,

                degree,

                dependencyWeight,

                influence,

                risk

            };

        });

    }

    /**
     * Returns highest score first.
     */
    sortDescending(
        scores: RelationshipScore[]
    ): RelationshipScore[] {

        return [...scores]
            .sort((a, b) => b.score - a.score);

    }

    /**
     * Returns only important nodes.
     */
    topNodes(
        scores: RelationshipScore[],
        limit = 10
    ): RelationshipScore[] {

        return this
            .sortDescending(scores)
            .slice(0, limit);

    }

    /**
     * Score for dependency density.
     */
    private computeDependencyWeight(

        inbound: number,

        outbound: number

    ): number {

        return (

            inbound * 8 +

            outbound * 6

        );

    }

    /**
     * Measures graph influence.
     */
    private computeInfluence(

        outbound: number,

        degree: number

    ): number {

        return (

            outbound * 5 +

            degree * 2

        );

    }

    /**
     * Risk estimation.
     */
    private computeRisk(

        node: GraphNode,

        inbound: number,

        outbound: number

    ): number {

        let score = 0;

        score += inbound * 4;

        if (node.isMilestone) {

            score += 25;

        }

        if (node.completed) {

            score -= 8;

        }

        if (node.estimatedHours) {

            score +=
                Math.min(
                    20,
                    node.estimatedHours
                );

        }

        if (node.storyPoints) {

            score +=
                node.storyPoints * 2;

        }

        if (outbound > 5) {

            score += 12;

        }

        return score;

    }

    /**
     * Converts raw score into 0-100.
     */
    private normalize(
        score: number
    ): number {

        return Math.max(
            0,
            Math.min(
                100,
                Math.round(score)
            )
        );

    }

}