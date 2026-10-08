import { GraphNode } from './graph-node.model';

export interface Point {
    x: number;
    y: number;
}

/** A routed edge: the SVG path 'd' plus the point its cycle badge is drawn at. */
export interface EdgeRoute {
    path: string;
    mx: number;
    my: number;
}

export interface EdgeRouteOptions {
    /** Extra gap (world units) beyond a card's edge before an arrowhead is drawn, so the tip is visible instead of hidden under the target card. */
    arrowGap: number;
    /** Gap (world units) between parallel edge lanes leaving/entering the same node. */
    laneGap: number;
    /** Extra clearance kept between a detour corridor and the node it's routing around. */
    detourMargin: number;
}

export const DEFAULT_EDGE_ROUTE_OPTIONS: Readonly<EdgeRouteOptions> = {
    arrowGap: 6,
    laneGap: 12,
    detourMargin: 28
};

/**
 * Routes one edge as an orthogonal polyline from source to target: straight segments joined by
 * 90° elbows, offset into lanes when several edges share a node side.
 *
 * @param outIndex/outCount this edge's position among the source's outgoing edges
 * @param inIndex/inCount this edge's position among the target's incoming edges
 * @param obstacles every node that isn't one of this edge's own endpoints
 */
export function routeEdge(
    source: GraphNode,
    target: GraphNode,
    outIndex: number,
    outCount: number,
    inIndex: number,
    inCount: number,
    obstacles: GraphNode[],
    options: EdgeRouteOptions = DEFAULT_EDGE_ROUTE_OPTIONS
): EdgeRoute {

    const exitOffset = outCount > 1 ? (outIndex - (outCount - 1) / 2) * options.laneGap : 0;
    const entryOffset = inCount > 1 ? (inIndex - (inCount - 1) / 2) * options.laneGap : 0;

    const sourceHalfW = source.width / 2, sourceHalfH = source.height / 2;
    const targetHalfW = target.width / 2, targetHalfH = target.height / 2;

    const dx = target.x - source.x;
    const dy = target.y - source.y;

    const sameRow = Math.abs(dy) < Math.max(sourceHalfH, targetHalfH) + 20;
    const sameColumn = Math.abs(dx) < Math.max(sourceHalfW, targetHalfW) + 20;

    let points: Point[];

    if (sameRow && !sameColumn) {
        // Natural left<->right flow: exit/enter from the facing sides.
        const goRight = dx > 0;
        const startX = source.x + (goRight ? sourceHalfW : -sourceHalfW);
        const startY = source.y + exitOffset;
        const endX = target.x + (goRight ? -targetHalfW - options.arrowGap : targetHalfW + options.arrowGap);
        const endY = target.y + entryOffset;

        points = startY === endY
            ? [{ x: startX, y: startY }, { x: endX, y: endY }]
            : [
                { x: startX, y: startY },
                { x: (startX + endX) / 2, y: startY },
                { x: (startX + endX) / 2, y: endY },
                { x: endX, y: endY }
            ];

    } else if (sameColumn) {
        // Natural up<->down flow: straight drop/rise, offset within each card's edge.
        const goDown = dy > 0;
        const startX = source.x + exitOffset;
        const startY = source.y + (goDown ? sourceHalfH : -sourceHalfH);
        const endX = target.x + entryOffset;
        const endY = target.y + (goDown ? -targetHalfH - options.arrowGap : targetHalfH + options.arrowGap);

        points = [{ x: startX, y: startY }, { x: endX, y: startY }, { x: endX, y: endY }];

    } else {
        // Diagonal: leave the side facing the target, one elbow into the
        // target's top or bottom edge.
        const goRight = dx > 0;
        const goDown = dy > 0;
        const startX = source.x + (goRight ? sourceHalfW : -sourceHalfW);
        const startY = source.y + exitOffset;
        const endX = target.x + entryOffset;
        const endY = target.y + (goDown ? -targetHalfH - options.arrowGap : targetHalfH + options.arrowGap);

        points = [{ x: startX, y: startY }, { x: endX, y: startY }, { x: endX, y: endY }];
    }

    // Only now do we check for a real collision — this replaces the old
    // "always detour if far enough right" hack with an actual test.
    const blocker = obstacles.find(n => pathIntersectsRect(points, n));
    if (blocker) {
        points = detourAroundNode(points, blocker, options.detourMargin);
    }

    const path = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
    const mid = points[Math.floor((points.length - 1) / 2)];
    return { path, mx: (mid.x + points[Math.min(points.length - 1, Math.floor((points.length - 1) / 2) + 1)].x) / 2, my: mid.y };
}

function detourAroundNode(
    points: Point[],
    blocker: GraphNode,
    detourMargin: number
): Point[] {

    const start = points[0];
    const end = points[points.length - 1];

    const distanceAbove = Math.abs(start.y - (blocker.y - blocker.height / 2 - detourMargin));
    const distanceBelow = Math.abs(start.y - (blocker.y + blocker.height / 2 + detourMargin));
    const goAbove = distanceAbove <= distanceBelow;

    const corridorY = goAbove
        ? blocker.y - blocker.height / 2 - detourMargin
        : blocker.y + blocker.height / 2 + detourMargin;

    return [
        start,
        { x: start.x, y: corridorY },
        { x: end.x, y: corridorY },
        end
    ];
}

/** True if any segment of an orthogonal (multi-point) path passes through node's bounding box. */
export function pathIntersectsRect(
    points: Point[],
    node: GraphNode
): boolean {
    for (let i = 0; i < points.length - 1; i++) {
        if (segmentIntersectsRect(points[i], points[i + 1], node)) {
            return true;
        }
    }
    return false;
}

/** True if the segment p1->p2 passes through node's bounding box (padded slightly so near-misses still count). */
function segmentIntersectsRect(
    p1: Point,
    p2: Point,
    node: GraphNode
): boolean {

    const pad = 10;
    const left = node.x - node.width / 2 - pad;
    const right = node.x + node.width / 2 + pad;
    const top = node.y - node.height / 2 - pad;
    const bottom = node.y + node.height / 2 + pad;

    const segMinX = Math.min(p1.x, p2.x), segMaxX = Math.max(p1.x, p2.x);
    const segMinY = Math.min(p1.y, p2.y), segMaxY = Math.max(p1.y, p2.y);
    if (segMaxX < left || segMinX > right || segMaxY < top || segMinY > bottom) {
        return false;
    }

    const inside = (p: Point) =>
        p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;
    if (inside(p1) || inside(p2)) return true;

    const corners = [
        { x: left, y: top }, { x: right, y: top },
        { x: right, y: bottom }, { x: left, y: bottom }
    ];

    for (let i = 0; i < 4; i++) {
        if (segmentsIntersect(p1, p2, corners[i], corners[(i + 1) % 4])) {
            return true;
        }
    }

    return false;
}

function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
    const d1 = cross(p3, p4, p1);
    const d2 = cross(p3, p4, p2);
    const d3 = cross(p1, p2, p3);
    const d4 = cross(p1, p2, p4);

    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
        && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function cross(a: Point, b: Point, c: Point): number {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
