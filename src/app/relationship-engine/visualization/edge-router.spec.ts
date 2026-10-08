import { RelationshipType } from '../../models/board.model';
import {
    EdgeRoute,
    EdgeRouteInput,
    MARKER_TIP_OFFSET,
    MIN_VISIBLE_STROKE,
    Point,
    Rect,
    RouteCard,
    TIP_CLEARANCE,
    cardHeightToGraphUnits,
    cardRect,
    finalSegmentMin,
    routeEdge,
    tipReach
} from './edge-router';

const WIDTH = 220;
const ALL_TYPES = [
    RelationshipType.Parent,
    RelationshipType.Blocks,
    RelationshipType.DependsOn,
    RelationshipType.Related,
    RelationshipType.Duplicate,
    RelationshipType.SplitFrom
];

/** A card at layout position (x, row y) with the given rendered height (100/124/148 seen in the app). */
function card(id: number, x: number, y: number, height = 124): RouteCard {
    return { id, x, y, rect: cardRect({ x, y, width: WIDTH }, height) };
}

interface Lanes { outIndex: number; outCount: number; inIndex: number; inCount: number }
const ONE_LANE: Lanes = { outIndex: 0, outCount: 1, inIndex: 0, inCount: 1 };

function route(
    source: RouteCard,
    target: RouteCard,
    cards: RouteCard[],
    type = RelationshipType.DependsOn,
    lanes: Lanes = ONE_LANE,
    warn = jasmine.createSpy('warn')
): EdgeRoute {
    const input: EdgeRouteInput = { edgeId: source.id * 1000 + target.id, relationType: type, source, target, cards, ...lanes };
    return routeEdge(input, warn);
}

// ---------------------------------------------------------------------
// Independent checks of the invariants (not the router's own helpers)
// ---------------------------------------------------------------------

/** Length of an axis-aligned segment strictly inside rect grown by `pad`. */
function inside(a: Point, b: Point, r: Rect, pad: number): number {
    const l = r.left - pad, rt = r.right + pad, t = r.top - pad, bt = r.bottom + pad;
    if (a.y === b.y) return a.y > t && a.y < bt ? Math.max(0, Math.min(Math.max(a.x, b.x), rt) - Math.max(Math.min(a.x, b.x), l)) : 0;
    if (a.x === b.x) return a.x > l && a.x < rt ? Math.max(0, Math.min(Math.max(a.y, b.y), bt) - Math.max(Math.min(a.y, b.y), t)) : 0;
    return Infinity; // not orthogonal
}

/** The first segment starts on its source's border; look at it from just outside. */
function testedSegments(points: Point[]): [Point, Point][] {
    return points.slice(0, -1).map((a, i) => {
        const b = points[i + 1];
        if (i > 0) return [a, b];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        return [{ x: a.x + (b.x - a.x) / len * 1.5, y: a.y + (b.y - a.y) / len * 1.5 }, b];
    });
}

function expectClean(r: EdgeRoute, cards: RouteCard[], target: RouteCard, type: RelationshipType, label = ''): void {
    const pts = r.points;
    expect(r.valid).withContext(`${label} valid`).toBeTrue();

    // Orthogonal, no segment inside any card (own source and target included) or on its border.
    testedSegments(pts).forEach(([a, b], i) => {
        for (const c of cards) {
            expect(inside(a, b, c.rect, 1)).withContext(`${label} segment ${i} vs card ${c.id} (${r.path})`).toBe(0);
        }
    });

    // Last segment: perpendicular to the target border it points at; base exactly tipReach outside it;
    // the arrowhead's tip TIP_CLEARANCE outside it; at least finalSegmentMin from the last turn.
    const end = pts[pts.length - 1], turn = pts[pts.length - 2];
    const t = target.rect;
    let border: number, along: number, baseDistance: number, turnDistance: number;
    if (turn.x === end.x) {
        const down = end.y > turn.y;
        border = down ? t.top : t.bottom;
        along = down ? 1 : -1;
        baseDistance = (border - end.y) * along;
        turnDistance = (border - turn.y) * along;
        expect(end.x).withContext(`${label} within the border's span`).toBeGreaterThanOrEqual(t.left);
        expect(end.x).toBeLessThanOrEqual(t.right);
    } else {
        expect(turn.y).withContext(`${label} last segment axis-aligned`).toBe(end.y);
        const right = end.x > turn.x;
        border = right ? t.left : t.right;
        along = right ? 1 : -1;
        baseDistance = (border - end.x) * along;
        turnDistance = (border - turn.x) * along;
        expect(end.y).withContext(`${label} within the border's span`).toBeGreaterThanOrEqual(t.top);
        expect(end.y).toBeLessThanOrEqual(t.bottom);
    }
    expect(baseDistance).withContext(`${label} base distance`).toBeCloseTo(tipReach(type), 6);
    expect(baseDistance - MARKER_TIP_OFFSET[type]).withContext(`${label} tip clearance`).toBeCloseTo(TIP_CLEARANCE, 6);
    expect(turnDistance).withContext(`${label} final segment length`).toBeGreaterThanOrEqual(finalSegmentMin(type) - 1e-6);
}

/** Lanes as the component assigns them: by the other end's x, ties by id. */
function laneOf(edges: [number, number][], cards: Map<number, RouteCard>, edge: [number, number]): Lanes {
    const outs = edges.filter(e => e[0] === edge[0]).sort((a, b) => cards.get(a[1])!.x - cards.get(b[1])!.x || a[1] - b[1]);
    const ins = edges.filter(e => e[1] === edge[1]).sort((a, b) => cards.get(a[0])!.x - cards.get(b[0])!.x || a[0] - b[0]);
    return { outIndex: outs.indexOf(edge), outCount: outs.length, inIndex: ins.indexOf(edge), inCount: ins.length };
}

describe('edge-router', () => {

    it('treats one CSS pixel of card layout as one graph unit', () => {
        expect(cardHeightToGraphUnits(124)).toBe(124);
        expect(cardHeightToGraphUnits(147.5)).toBe(147.5);
    });

    it('anchors a card at its top and grows it downward with its content', () => {
        expect(cardRect({ x: 0, y: 200, width: WIDTH }, 148)).toEqual({ left: -110, right: 110, top: 146, bottom: 294 });
        expect(cardRect({ x: 0, y: 200, width: WIDTH }, 100)).toEqual({ left: -110, right: 110, top: 146, bottom: 246 });
    });

    // 1 + 17
    it('routes cleanly between cards of different heights in the same row', () => {
        for (const [ha, hb] of [[100, 148], [148, 100], [124, 148]]) {
            const a = card(1, 0, 200, ha), b = card(2, 280, 200, hb);
            const cards = [a, b];
            expectClean(route(a, b, cards), cards, b, RelationshipType.DependsOn, `${ha}->${hb}`);
            const lanes = { outIndex: 0, outCount: 3, inIndex: 2, inCount: 3 };
            expectClean(route(a, b, cards, RelationshipType.DependsOn, lanes), cards, b, RelationshipType.DependsOn, `${ha}->${hb} lanes`);
        }
    });

    // 2 + 17
    it('routes cleanly between cards of different heights in adjacent rows', () => {
        for (const hs of [100, 124, 148]) {
            for (const ht of [100, 124, 148]) {
                const s = card(1, 0, 0, hs);
                const below = card(2, 0, 200, ht);
                const diagonal = card(3, 280, 200, ht);
                const cards = [s, below, diagonal];
                const lanes = { outIndex: 0, outCount: 2, inIndex: 0, inCount: 1 };
                expectClean(route(s, below, cards, RelationshipType.DependsOn, lanes), cards, below, RelationshipType.DependsOn, `${hs}/${ht} column`);
                expectClean(route(s, diagonal, cards), cards, diagonal, RelationshipType.DependsOn, `${hs}/${ht} diagonal`);
                expectClean(route(below, s, cards, RelationshipType.DependsOn, lanes), cards, s, RelationshipType.DependsOn, `${hs}/${ht} upward`);
            }
        }
    });

    // 3
    it('re-checks a detour and repairs the collision the first detour creates', () => {
        const s = card(1, 0, 0), t = card(2, 840, 0);
        const between = card(3, 420, 0);
        // Cards where both corridors around `between` would run, at the preferred and at the squeezed margin.
        const aboveCorridor = card(4, 280, -140);   // rect -194..-70
        const belowCorridor = card(5, 560, 126);    // rect 72..196
        const cards = [s, t, between, aboveCorridor, belowCorridor];

        const r = route(s, t, cards);

        expectClean(r, cards, t, RelationshipType.DependsOn);
        // A single detour around `between` would run at y -82/-77 or 98/93, through one of the other
        // cards; the repaired route clears both `between` and the card over it.
        expect(Math.min(...r.points.map(p => p.y))).toBeLessThan(aboveCorridor.rect.top);
    });

    // 4 + 11 + 12: the #85 geometry from the investigation (96 -> 85 used to run under #100)
    it('routes around the card between it and its target without entering its own source or target', () => {
        const target = card(85, 0, 0, 100);
        const source = card(96, -280, 200, 124);
        const between = card(100, 0, 200, 124);
        const side = card(109, 280, 200, 148);
        const cards = [target, source, between, side];

        const r = route(source, target, cards, RelationshipType.DependsOn, { outIndex: 2, outCount: 3, inIndex: 0, inCount: 3 });

        expectClean(r, cards, target, RelationshipType.DependsOn);
        // Leaves the source perpendicular to its side, not along it.
        expect(r.points[1].y).toBe(r.points[0].y);
        expect(r.points[1].x).toBeGreaterThan(source.rect.right);
    });

    // The view from the bug report: #78 with #113 and #84 expanded
    it('routes the reported #78 / #113 view cleanly', () => {
        const cards = [
            card(78, 0, 0, 100),
            card(113, 0, 200, 124),
            card(104, -420, 400, 148), card(84, -140, 400, 148), card(114, 140, 400, 148), card(118, 420, 400, 124),
            card(87, -140, 600, 148)
        ];
        const byId = new Map(cards.map(c => [c.id, c]));
        const edges: [number, number, RelationshipType][] = [
            [78, 113, RelationshipType.Related],
            [104, 113, RelationshipType.Parent],
            [114, 113, RelationshipType.DependsOn],
            [118, 113, RelationshipType.DependsOn],
            [113, 84, RelationshipType.DependsOn],
            [87, 84, RelationshipType.DependsOn]
        ];
        const pairs = edges.map(([s, t]) => [s, t] as [number, number]);

        edges.forEach(([s, t, type], i) => {
            const r = route(byId.get(s)!, byId.get(t)!, cards, type, laneOf(pairs, byId, pairs[i]));
            expectClean(r, cards, byId.get(t)!, type, `${s}->${t}`);
        });
    });

    // 5
    it('routes same-row neighbours side to side', () => {
        const a = card(1, 0, 200), b = card(2, 280, 200);
        const cards = [a, b];

        const straight = route(a, b, cards);
        expect(straight.points.length).toBe(2);
        expectClean(straight, cards, b, RelationshipType.DependsOn);

        const elbow = route(a, b, cards, RelationshipType.DependsOn, { outIndex: 0, outCount: 2, inIndex: 1, inCount: 2 });
        expect(elbow.points.length).toBe(4);
        expectClean(elbow, cards, b, RelationshipType.DependsOn);
    });

    // 6
    it('goes around a card between two same-row cards', () => {
        const a = card(1, 0, 200), between = card(2, 280, 200, 148), c = card(3, 560, 200);
        const cards = [a, between, c];
        expectClean(route(a, c, cards), cards, c, RelationshipType.DependsOn);
        expectClean(route(c, a, cards), cards, a, RelationshipType.DependsOn);
    });

    // 7
    it('routes edges that cross more than one row', () => {
        const top = card(1, 0, 0), middle = card(2, 0, 200, 148), bottom = card(3, 0, 400);
        const sideMiddle = card(4, 280, 200), farBottom = card(5, 560, 400);
        const cards = [top, middle, bottom, sideMiddle, farBottom];
        expectClean(route(top, bottom, cards), cards, bottom, RelationshipType.DependsOn, 'straight down');
        expectClean(route(bottom, top, cards), cards, top, RelationshipType.DependsOn, 'straight up');
        expectClean(route(top, farBottom, cards), cards, farBottom, RelationshipType.DependsOn, 'diagonal');
    });

    // 8
    it('stays clean for every lane offset combination', () => {
        const s = card(1, 0, 0), below = card(2, 0, 200), right = card(3, 280, 200), sideways = card(4, 280, 0);
        const cards = [s, below, right, sideways];
        for (let outCount = 1; outCount <= 4; outCount++) {
            for (let inCount = 1; inCount <= 4; inCount++) {
                for (let outIndex = 0; outIndex < outCount; outIndex++) {
                    for (let inIndex = 0; inIndex < inCount; inIndex++) {
                        const lanes = { outIndex, outCount, inIndex, inCount };
                        const tag = JSON.stringify(lanes);
                        expectClean(route(s, below, cards, RelationshipType.DependsOn, lanes), cards, below, RelationshipType.DependsOn, `column ${tag}`);
                        expectClean(route(s, right, cards, RelationshipType.DependsOn, lanes), cards, right, RelationshipType.DependsOn, `diagonal ${tag}`);
                        expectClean(route(s, sideways, cards, RelationshipType.DependsOn, lanes), cards, sideways, RelationshipType.DependsOn, `row ${tag}`);
                    }
                }
            }
        }
    });

    // 9
    it('routes both directions of each pair', () => {
        const cards = [card(1, 0, 0, 100), card(2, 0, 200, 148), card(3, 280, 200), card(4, -280, 200, 148), card(5, 280, 0)];
        for (const a of cards) {
            for (const b of cards) {
                if (a === b) continue;
                expectClean(route(a, b, cards), cards, b, RelationshipType.DependsOn, `${a.id}->${b.id}`);
            }
        }
    });

    // 10
    it('is deterministic, whatever order the cards come in', () => {
        const target = card(85, 0, 0, 100), source = card(96, -280, 200), between = card(100, 0, 200), side = card(109, 280, 200, 148);
        const cards = [target, source, between, side];
        const lanes = { outIndex: 2, outCount: 3, inIndex: 0, inCount: 3 };

        const first = route(source, target, cards, RelationshipType.DependsOn, lanes);
        const again = route(source, target, cards, RelationshipType.DependsOn, lanes);
        const shuffled = route(source, target, [side, between, target, source], RelationshipType.DependsOn, lanes);

        expect(again).toEqual(first);
        expect(shuffled).toEqual(first);
    });

    // 13
    it('leaves every arrowhead tip exactly TIP_CLEARANCE outside the target border', () => {
        const s = card(1, 0, 0), below = card(2, 280, 200, 148), sideways = card(3, 280, 0, 100);
        const cards = [s, below, sideways];
        for (const type of ALL_TYPES) {
            expectClean(route(s, below, cards, type), cards, below, type, `diagonal type ${type}`);
            expectClean(route(s, sideways, cards, type), cards, sideways, type, `row type ${type}`);
        }
    });

    // 18: final segment rule per marker type, in a detour, a corridor and a same-column route
    it('keeps the final segment perpendicular and long enough for every marker type', () => {
        const detourTarget = card(85, 0, 0, 100), detourSource = card(96, -280, 200), detourBetween = card(100, 0, 200);
        const rowA = card(1, 0, 600), rowBetween = card(2, 280, 600, 148), rowC = card(3, 560, 600);
        const colS = card(4, 1200, 0, 148), colT = card(5, 1200, 200, 148);
        const cards = [detourTarget, detourSource, detourBetween, rowA, rowBetween, rowC, colS, colT];
        const lanes = { outIndex: 0, outCount: 2, inIndex: 1, inCount: 2 };

        for (const type of ALL_TYPES) {
            expectClean(route(detourSource, detourTarget, cards, type), cards, detourTarget, type, `detour type ${type}`);
            expectClean(route(rowA, rowC, cards, type), cards, rowC, type, `corridor type ${type}`);
            expectClean(route(colS, colT, cards, type, lanes), cards, colT, type, `same column type ${type}`);
        }
        expect(finalSegmentMin(RelationshipType.Parent)).toBe(TIP_CLEARANCE + 20 + MIN_VISIBLE_STROKE);
    });

    // 15
    it('falls back deterministically, with a warning, when the target is boxed in', () => {
        const target = card(1, 0, 200, 124);                         // rect -110..110 x 146..270
        const cards = [
            target,
            { id: 2, x: -235, y: 200, rect: { left: -350, right: -120, top: 100, bottom: 320 } },  // 10 to the left
            { id: 3, x: 235, y: 200, rect: { left: 120, right: 350, top: 100, bottom: 320 } },     // 10 to the right
            { id: 4, x: 0, y: 60, rect: { left: -120, right: 120, top: 20, bottom: 136 } },        // 10 above
            { id: 5, x: 0, y: 340, rect: { left: -120, right: 120, top: 280, bottom: 400 } },      // 10 below
            card(6, -700, -300)
        ];
        const source = cards[5] as RouteCard;
        const warn = jasmine.createSpy('warn');

        const first = route(source, target, cards, RelationshipType.DependsOn, ONE_LANE, warn);
        const again = route(source, target, cards, RelationshipType.DependsOn, ONE_LANE, jasmine.createSpy('warn'));

        expect(first.valid).toBeFalse();
        expect(again).toEqual(first);
        expect(warn).toHaveBeenCalledTimes(1);
        const [message, details] = warn.calls.mostRecent().args;
        expect(message).toContain('no collision-free route');
        expect(details).toEqual(jasmine.objectContaining({ edgeId: 6001, sourceId: 6, targetId: 1, path: first.path }));
        expect(first.points.length).toBeGreaterThanOrEqual(2);
    });

    // 17: a card too tall for the band between rows can't keep the final-segment rule -> fallback
    it('falls back with a warning when an oversized card leaves no room for the final segment', () => {
        const tall = card(1, 0, 0, 190);          // bottom 136, the next row's top is 146
        const below = card(2, 0, 200, 124);
        const warn = jasmine.createSpy('warn');

        const r = route(tall, below, [tall, below], RelationshipType.DependsOn, { outIndex: 0, outCount: 2, inIndex: 1, inCount: 2 }, warn);

        expect(r.valid).toBeFalse();
        expect(warn).toHaveBeenCalledTimes(1);
    });
});
