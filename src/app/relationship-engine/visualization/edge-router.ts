import { RelationshipType } from '../../models/board.model';
import { GraphNodeFactory } from './graph-node.model';

export interface Point {
    x: number;
    y: number;
}

export interface Rect {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

/** A card as the router sees it: the node's logical position plus the card's rendered rectangle. */
export interface RouteCard {
    id: number;
    /** Logical node position (layout x and row y), as on GraphNode. */
    x: number;
    y: number;
    /** The card as rendered: see cardRect(). */
    rect: Rect;
}

export interface EdgeRouteInput {
    edgeId: number;
    relationType: RelationshipType;
    source: RouteCard;
    target: RouteCard;
    /** This edge's position among the source's outgoing edges / the target's incoming edges (lanes). */
    outIndex: number;
    outCount: number;
    inIndex: number;
    inCount: number;
    /** Every card on the graph, this edge's own source and target included. */
    cards: readonly RouteCard[];
}

/** A routed edge: an orthogonal polyline ending at the arrowhead's base, plus where its cycle badge goes. */
export interface EdgeRoute {
    path: string;
    points: Point[];
    mx: number;
    my: number;
    /** False when the bounded repair found no collision-free route and the fallback was used. */
    valid: boolean;
}

export type RouteWarn = (message: string, details: Record<string, unknown>) => void;

/** Gap between parallel lanes leaving the same card. */
export const LANE_GAP = 12;

/** Width of every arrowhead across its edge (the markers are drawn 20 graph units high). */
export const ARROWHEAD_WIDTH = 20;
const ARROWHEAD_HALF_WIDTH = ARROWHEAD_WIDTH / 2;

/**
 * Gap between lanes entering the same card: an arrowhead's width plus a little space, so neighbouring
 * arrowheads (Blocks' stop bars especially) stay visibly separate. Compressed when the border is too
 * short to fit them all.
 */
export const ENTRY_LANE_GAP = ARROWHEAD_WIDTH + 4;

/**
 * Distance between an arrowhead's tip and the target card's border. Larger than the most a card grows
 * when selected (scale 1.05: 5.5 at the sides of a 220 card) or hovered (scale 1.03 and 2 up: about 4.2
 * at the top), so the grown card never covers a tip.
 */
export const TIP_CLEARANCE = 6;

/** Stroke that stays visible between the last turn and the arrowhead's base. */
export const MIN_VISIBLE_STROKE = 6;

/** How far a detour leaves a side port before it may turn, so it never runs along the card's border. */
export const PORT_STUB = 20;

/** Preferred and minimum distance between a detour corridor and the cards it goes around. */
export const CORRIDOR_MARGIN = 28;
export const MIN_CORRIDOR_MARGIN = 6;

/** Bounded repair: how many collisions one edge may try to route around before the fallback. */
export const MAX_ROUTE_REPAIRS = 6;

/**
 * Distance (graph units) from an arrowhead's base (where the path ends, the marker's refX) to its
 * tip, per relationship type. Must match the <marker> definitions in relationship-graph.component.html
 * (userSpaceOnUse, viewBox 0 0 10 10 drawn at 20x20, so one marker unit is 2 graph units).
 */
export const MARKER_TIP_OFFSET: Readonly<Record<RelationshipType, number>> = {
    [RelationshipType.Parent]: 20,     // triangle 0..10, base 0
    [RelationshipType.Blocks]: 8,      // stop bar 6..10, base 6
    [RelationshipType.DependsOn]: 15,  // notched triangle, base at the notch 2.5, tip 10
    [RelationshipType.Related]: 7,     // dot centred at 5 (base), radius 3.5
    [RelationshipType.Duplicate]: 20,  // diamond 0..10, base 0
    [RelationshipType.SplitFrom]: 4    // chevrons, base 8, outer tip 10 (vertex 9 + half its stroke)
};

/** Collision tests treat every card as 1 unit larger, so a segment lying on a border counts as a hit. */
const COLLISION_PAD = 1;

/** A route's first point sits on its source's border; collision tests start just outside it. */
const PORT_EXIT = 1.5;

const EPSILON = 1e-6;

/** Logical rows are 200 apart; nodes closer than this vertically share a row (the old max(halfHeight) + 20). */
const SAME_ROW_TOLERANCE = GraphNodeFactory.DEFAULT_HEIGHT / 2 + 20;

/**
 * Card height measured in the DOM -> graph units. Cards are HTML laid out inside a <foreignObject>, and
 * a foreignObject lays its content out in its own user space: one CSS pixel of card layout is one graph
 * unit. Pan/zoom (the graph layer's transform) and the <svg> viewBox scaling only affect how that is
 * painted, and so do the cards' hover/selection transforms; a layout size (ResizeObserver border box,
 * offsetHeight) ignores all of them. Verified in the browser at two zoom levels.
 */
export function cardHeightToGraphUnits(cssPixels: number): number {
    return cssPixels;
}

/**
 * The card's rendered rectangle. Cards are top-anchored: the top stays where it always was (half the
 * default height above the node's row y) and the card grows downward with its content.
 */
export function cardRect(node: { x: number; y: number; width: number }, renderedHeight: number): Rect {
    const top = node.y - GraphNodeFactory.DEFAULT_HEIGHT / 2;
    return {
        left: node.x - node.width / 2,
        right: node.x + node.width / 2,
        top,
        bottom: top + renderedHeight
    };
}

/** Clearance + arrowhead: how far the path's end (the arrowhead's base) stays from the target's border. */
export function tipReach(type: RelationshipType): number {
    return TIP_CLEARANCE + (MARKER_TIP_OFFSET[type] ?? MARKER_TIP_OFFSET[RelationshipType.Related]);
}

/** Minimum distance from the route's last turn to the target's border: the arrowhead plus some visible stroke. */
export function finalSegmentMin(type: RelationshipType): number {
    return tipReach(type) + MIN_VISIBLE_STROKE;
}

/**
 * Routes one edge as an orthogonal polyline (straight segments, 90° turns) from the source card's
 * border to the arrowhead's base, which sits tipReach() outside the target card's border.
 *
 * Preferred shapes, unchanged in spirit: same row -> side to side (one elbow when the lanes differ);
 * same column -> bottom/top to top/bottom (a jog in the free band when the lanes differ); otherwise ->
 * out of the side facing the target, one elbow, into its top or bottom.
 *
 * Every route is checked against every card (its own source and target included). A segment that
 * cuts into, or runs along, a card is replaced by a bend through a corridor around all the cards it
 * hits; the result is checked again, at most MAX_ROUTE_REPAIRS times.
 *
 * Fallback: if no collision-free route satisfying the final-segment rule is found, the route with the
 * least length inside cards among all routes tried is returned (ties: the one tried first), with
 * valid = false, and `warn` is called with the edge, the path and the blocking cards. It never throws.
 *
 * Deterministic: a pure function of the input; cards are always considered in id order.
 */
export function routeEdge(input: EdgeRouteInput, warn: RouteWarn = defaultWarn): EdgeRoute {

    const cards = [...input.cards].sort((a, b) => a.id - b.id);
    const ctx: RouteContext = { input, cards, reach: tipReach(input.relationType), finalMin: finalSegmentMin(input.relationType) };

    let current = simplify(preferredRoute(ctx));
    const tried: Point[][] = [current];

    for (let attempt = 0; attempt < MAX_ROUTE_REPAIRS; attempt++) {

        if (isValid(ctx, current)) {
            return finish(current, true);
        }

        const hit = firstCollision(ctx, current);
        if (!hit) {
            break; // collision-free, but the final segment can't be made long enough: nothing to repair
        }

        const candidates = bendCandidates(ctx, current, hit.index, hit.cards).map(simplify);
        tried.push(...candidates);

        const clean = candidates.find(c => isValid(ctx, c));
        if (clean) {
            return finish(clean, true);
        }

        current = leastOverlapping(ctx, candidates) ?? current;
    }

    if (isValid(ctx, current)) {
        return finish(current, true);
    }

    const fallback = leastOverlapping(ctx, tried)!;
    warn('[relationship-graph] no collision-free route; using the least overlapping one', {
        edgeId: input.edgeId,
        sourceId: input.source.id,
        targetId: input.target.id,
        relationType: input.relationType,
        path: toPath(fallback),
        blockerIds: blockersOf(ctx, fallback),
        attempts: tried.length
    });

    return finish(fallback, false);
}

// =====================================================================
// Preferred route
// =====================================================================

interface RouteContext {
    input: EdgeRouteInput;
    cards: RouteCard[];
    reach: number;
    finalMin: number;
}

function preferredRoute(ctx: RouteContext): Point[] {

    const { source, target, outIndex, outCount, inIndex, inCount } = ctx.input;
    const s = source.rect, t = target.rect;

    const exitOffset = outCount > 1 ? (outIndex - (outCount - 1) / 2) * LANE_GAP : 0;
    const topBottomEntry = entryLaneOffset(inIndex, inCount, target.x, t.left, t.right);
    const sideEntry = entryLaneOffset(inIndex, inCount, target.y, t.top, t.bottom);

    const dx = target.x - source.x;
    const dy = target.y - source.y;

    const sameRow = Math.abs(dy) < SAME_ROW_TOLERANCE;
    const sameColumn = Math.abs(dx) < Math.max(s.right - s.left, t.right - t.left) / 2 + 20;

    if (sameRow && !sameColumn) {
        // Left <-> right: out of and into the facing sides.
        const goRight = dx > 0;
        const start = { x: goRight ? s.right : s.left, y: source.y + exitOffset };
        const border = goRight ? t.left : t.right;
        const end = { x: border + (goRight ? -ctx.reach : ctx.reach), y: target.y + sideEntry };

        if (start.y === end.y) {
            return [start, end];
        }

        // Elbow halfway, but never closer to the target than the final-segment minimum.
        const midX = (start.x + end.x) / 2;
        const turnX = goRight ? Math.min(midX, border - ctx.finalMin) : Math.max(midX, border + ctx.finalMin);
        return [start, { x: turnX, y: start.y }, { x: turnX, y: end.y }, end];
    }

    const goDown = dy > 0;
    const border = goDown ? t.top : t.bottom;
    const end = { x: target.x + topBottomEntry, y: border + (goDown ? -ctx.reach : ctx.reach) };

    if (!sameColumn) {
        // Diagonal: out of the side facing the target, one elbow into its top or bottom. Only when the
        // entry lane lies clear of that side: otherwise the elbow would sit on (or inside) the source's
        // border, so leave through the top/bottom like a same-column edge.
        const goRight = dx > 0;
        const start = { x: goRight ? s.right : s.left, y: source.y + exitOffset };
        const clearOfSide = goRight ? end.x >= start.x + MIN_CORRIDOR_MARGIN : end.x <= start.x - MIN_CORRIDOR_MARGIN;
        if (clearOfSide) {
            return [start, { x: end.x, y: start.y }, end];
        }
    }

    // Up <-> down: out of the bottom/top, into the top/bottom.
    const start = { x: source.x + exitOffset, y: goDown ? s.bottom : s.top };

    if (start.x === end.x) {
        return [start, end];
    }

    // Jog in the middle of the free band: off the source's border, and far enough from the target's.
    let jogY = (start.y + border) / 2;
    jogY = goDown ? Math.min(jogY, border - ctx.finalMin) : Math.max(jogY, border + ctx.finalMin);
    jogY = goDown ? Math.max(jogY, start.y + MIN_CORRIDOR_MARGIN) : Math.min(jogY, start.y - MIN_CORRIDOR_MARGIN);
    return [start, { x: start.x, y: jogY }, { x: end.x, y: jogY }, end];
}

/**
 * Offset of an incoming lane along the border it enters (centred on the node's x, or row y for a
 * side): ENTRY_LANE_GAP apart, compressed if needed so every arrowhead stays within the border.
 */
function entryLaneOffset(index: number, count: number, centre: number, borderStart: number, borderEnd: number): number {
    if (count <= 1) return 0;
    const room = Math.min(centre - borderStart, borderEnd - centre) - ARROWHEAD_HALF_WIDTH;
    const gap = Math.max(0, Math.min(ENTRY_LANE_GAP, (2 * room) / (count - 1)));
    return (index - (count - 1) / 2) * gap;
}

// =====================================================================
// Repair
// =====================================================================

/**
 * Replaces segment i (a -> b) by a bend through a corridor around `hits`: for a horizontal segment a
 * corridor above or below them, for a vertical one left or right. A segment starting at the source
 * port first goes PORT_STUB straight out; one ending at the arrowhead's base keeps a straight final
 * stretch of MIN_VISIBLE_STROKE. Nearer side first (ties: above/left, as before); per side the
 * preferred margin, then the margin squeezed (down to MIN_CORRIDOR_MARGIN) to keep the final segment long enough.
 */
function bendCandidates(ctx: RouteContext, points: Point[], i: number, hits: RouteCard[]): Point[][] {

    const a = points[i], b = points[i + 1];
    const first = i === 0;
    const last = i === points.length - 2;
    const horizontal = Math.abs(a.y - b.y) < EPSILON;
    const box = union(hits.map(h => h.rect));

    const along = horizontal ? Math.sign(b.x - a.x) || 1 : Math.sign(b.y - a.y) || 1;
    const a1 = first
        ? (horizontal ? { x: a.x + along * PORT_STUB, y: a.y } : { x: a.x, y: a.y + along * PORT_STUB })
        : a;
    const b1 = last
        ? (horizontal ? { x: b.x - along * MIN_VISIBLE_STROKE, y: b.y } : { x: b.x, y: b.y - along * MIN_VISIBLE_STROKE })
        : b;

    const coordinate = horizontal ? a.y : a.x;
    const sides = [
        { low: true, preferred: (horizontal ? box.top : box.left) - CORRIDOR_MARGIN },
        { low: false, preferred: (horizontal ? box.bottom : box.right) + CORRIDOR_MARGIN }
    ].sort((p, q) => Math.abs(p.preferred - coordinate) - Math.abs(q.preferred - coordinate) || (p.low ? -1 : 1));

    const build = (c: number): Point[] => {
        const bend = horizontal
            ? [{ x: a1.x, y: c }, { x: b1.x, y: c }]
            : [{ x: c, y: a1.y }, { x: c, y: b1.y }];
        return [
            ...points.slice(0, i + 1),
            ...(first ? [a1] : []),
            ...bend,
            ...(last ? [b1] : []),
            ...points.slice(i + 1)
        ];
    };

    const candidates: Point[][] = [];
    for (const side of sides) {
        candidates.push(build(side.preferred));

        const squeezed = squeezedCorridor(ctx, box, horizontal, side.low);
        if (squeezed !== null && Math.abs(squeezed - side.preferred) > EPSILON) {
            candidates.push(build(squeezed));
        }
    }
    return candidates;
}

/**
 * A corridor on the given side of `box` that leaves the final segment at least finalSegmentMin long,
 * if one exists between the preferred and the minimum margin.
 */
function squeezedCorridor(ctx: RouteContext, box: Rect, horizontal: boolean, low: boolean): number | null {

    const t = ctx.input.target.rect;
    const edge = low ? (horizontal ? box.top : box.left) : (horizontal ? box.bottom : box.right);
    const nearest = edge + (low ? -MIN_CORRIDOR_MARGIN : MIN_CORRIDOR_MARGIN);
    const farthest = edge + (low ? -CORRIDOR_MARGIN : CORRIDOR_MARGIN);

    // The final segment enters the target's top/bottom when the corridor is horizontal, a side when vertical.
    const options = horizontal ? [t.top - ctx.finalMin, t.bottom + ctx.finalMin] : [t.left - ctx.finalMin, t.right + ctx.finalMin];
    const lo = Math.min(nearest, farthest), hi = Math.max(nearest, farthest);
    const fits = options.filter(c => c >= lo - EPSILON && c <= hi + EPSILON);
    if (!fits.length) return null;

    // Prefer the one closest to the preferred margin.
    return fits.sort((p, q) => Math.abs(p - farthest) - Math.abs(q - farthest))[0];
}

// =====================================================================
// Checks
// =====================================================================

function isValid(ctx: RouteContext, points: Point[]): boolean {
    return isOrthogonal(points) && !firstCollision(ctx, points) && finalSegmentOk(ctx, points);
}

function isOrthogonal(points: Point[]): boolean {
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i], b = points[i + 1];
        if (Math.abs(a.x - b.x) > EPSILON && Math.abs(a.y - b.y) > EPSILON) return false;
    }
    return points.length >= 2;
}

/**
 * The last segment is perpendicular to the target border it points at, ends exactly tipReach()
 * outside it, lies within that border's span, and starts at least finalSegmentMin() away from it.
 */
function finalSegmentOk(ctx: RouteContext, points: Point[]): boolean {

    if (points.length < 2) return false;

    const t = ctx.input.target.rect;
    const end = points[points.length - 1];
    const turn = points[points.length - 2];

    if (Math.abs(turn.x - end.x) < EPSILON) {
        const down = end.y > turn.y;
        const border = down ? t.top : t.bottom;
        return end.x >= t.left && end.x <= t.right
            && Math.abs(Math.abs(border - end.y) - ctx.reach) < 1e-3
            && (down ? end.y < border : end.y > border)
            && Math.abs(border - turn.y) >= ctx.finalMin - 1e-3;
    }

    if (Math.abs(turn.y - end.y) < EPSILON) {
        const right = end.x > turn.x;
        const border = right ? t.left : t.right;
        return end.y >= t.top && end.y <= t.bottom
            && Math.abs(Math.abs(border - end.x) - ctx.reach) < 1e-3
            && (right ? end.x < border : end.x > border)
            && Math.abs(border - turn.x) >= ctx.finalMin - 1e-3;
    }

    return false;
}

/** The first segment that cuts into, or runs along, any card, with every card it hits (id order). */
function firstCollision(ctx: RouteContext, points: Point[]): { index: number; cards: RouteCard[] } | null {
    for (let i = 0; i < points.length - 1; i++) {
        const [a, b] = segmentForTest(points, i);
        const cards = ctx.cards.filter(c => overlapLength(a, b, c.rect) > 0);
        if (cards.length) {
            return { index: i, cards };
        }
    }
    return null;
}

function blockersOf(ctx: RouteContext, points: Point[]): number[] {
    const ids = new Set<number>();
    for (let i = 0; i < points.length - 1; i++) {
        const [a, b] = segmentForTest(points, i);
        ctx.cards.filter(c => overlapLength(a, b, c.rect) > 0).forEach(c => ids.add(c.id));
    }
    return [...ids].sort((x, y) => x - y);
}

/** Total length of the route inside cards (padded), plus a large penalty if the final segment rule fails. */
function overlapScore(ctx: RouteContext, points: Point[]): number {
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
        const [a, b] = segmentForTest(points, i);
        for (const card of ctx.cards) total += overlapLength(a, b, card.rect);
    }
    return total + (finalSegmentOk(ctx, points) ? 0 : 10000);
}

function leastOverlapping(ctx: RouteContext, routes: Point[][]): Point[] | null {
    let best: Point[] | null = null;
    let bestScore = Infinity;
    for (const route of routes) {
        const score = overlapScore(ctx, route);
        if (score < bestScore - EPSILON) {
            best = route;
            bestScore = score;
        }
    }
    return best;
}

/** The segment as tested: the first one starts just outside its source port. */
function segmentForTest(points: Point[], i: number): [Point, Point] {
    const a = points[i], b = points[i + 1];
    if (i !== 0) return [a, b];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length <= PORT_EXIT) return [b, b];
    return [{ x: a.x + (b.x - a.x) / length * PORT_EXIT, y: a.y + (b.y - a.y) / length * PORT_EXIT }, b];
}

/** Length of an axis-aligned segment inside the card padded by COLLISION_PAD (strictly inside). */
function overlapLength(a: Point, b: Point, rect: Rect): number {
    const left = rect.left - COLLISION_PAD, right = rect.right + COLLISION_PAD;
    const top = rect.top - COLLISION_PAD, bottom = rect.bottom + COLLISION_PAD;

    if (Math.abs(a.y - b.y) < EPSILON) {
        if (!(a.y > top && a.y < bottom)) return 0;
        return Math.max(0, Math.min(Math.max(a.x, b.x), right) - Math.max(Math.min(a.x, b.x), left));
    }
    if (Math.abs(a.x - b.x) < EPSILON) {
        if (!(a.x > left && a.x < right)) return 0;
        return Math.max(0, Math.min(Math.max(a.y, b.y), bottom) - Math.max(Math.min(a.y, b.y), top));
    }
    return 0;
}

// =====================================================================
// Helpers
// =====================================================================

function union(rects: Rect[]): Rect {
    return {
        left: Math.min(...rects.map(r => r.left)),
        right: Math.max(...rects.map(r => r.right)),
        top: Math.min(...rects.map(r => r.top)),
        bottom: Math.max(...rects.map(r => r.bottom))
    };
}

/** Drops repeated points and points in the middle of a straight run. */
function simplify(points: Point[]): Point[] {
    const deduped = points.filter((p, i) => i === 0 || Math.abs(p.x - points[i - 1].x) > EPSILON || Math.abs(p.y - points[i - 1].y) > EPSILON);
    const out: Point[] = [];
    for (const p of deduped) {
        while (out.length >= 2) {
            const a = out[out.length - 2], b = out[out.length - 1];
            const collinear = (Math.abs(a.x - b.x) < EPSILON && Math.abs(b.x - p.x) < EPSILON)
                || (Math.abs(a.y - b.y) < EPSILON && Math.abs(b.y - p.y) < EPSILON);
            if (!collinear) break;
            out.pop();
        }
        out.push(p);
    }
    return out;
}

function toPath(points: Point[]): string {
    return `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
}

function finish(points: Point[], valid: boolean): EdgeRoute {
    const mid = points[Math.floor((points.length - 1) / 2)];
    const next = points[Math.min(points.length - 1, Math.floor((points.length - 1) / 2) + 1)];
    return { path: toPath(points), points, mx: (mid.x + next.x) / 2, my: mid.y, valid };
}

function defaultWarn(message: string, details: Record<string, unknown>): void {
    console.warn(message, details);
}
