export interface Point {
    x: number;
    y: number;
}

export interface Intersection extends Point {
    offset: number;
}

export type Segment = [Point, Point];
export type Polygon = Point[];

export type Random = () => number;

export function lerp(A: number, B: number, t: number): number {
    return A + (B - A) * t;
}

export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function seededRandom(seed: number): Random {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Standard normal sample (Box-Muller)
export function gaussian(): number {
    const u = 1 - Math.random();
    const v = Math.random();
    return Math.sqrt(-2*Math.log(u)) * Math.cos(2*Math.PI*v);
}

export function getIntersection(A: Point, B: Point, C: Point, D: Point): Intersection | null {
    const tTop = (D.x - C.x)*(A.y - C.y)-(D.y - C.y)*(A.x - C.x);
    const uTop = (C.y - A.y)*(A.x - B.x)-(C.x - A.x)*(A.y - B.y);
    const bottom = (D.y - C.y)*(B.x - A.x)-(D.x - C.x)*(B.y - A.y);

    if (bottom !== 0) {
        const t = tTop / bottom;
        const u = uTop / bottom;

        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            return {
                x: lerp(A.x, B.x, t),
                y: lerp(A.y, B.y, t),
                offset: t
            }
        }
    }

    return null;
}

export function polysIntersect(poly1: Polygon, poly2: Polygon): boolean {
    for (let i = 0; i < poly1.length; i++) {
        for (let j = 0; j < poly2.length; j++) {
            const touch = getIntersection(
                poly1[i],
                poly1[(i+1) % poly1.length],
                poly2[j],
                poly2[(j+1) % poly2.length]);

            if (touch) {
                return true;
            }
        }
    }
    return false;
}

export function sensorColor(proximity: number, alpha = 1): string {
    return `hsla(${lerp(150, 0, proximity)}, 100%, 60%, ${alpha})`;
}

export function sleep(milliseconds: number): void {
    const date = Date.now();
    let currentDate: number;
    do {
        currentDate = Date.now();
    } while (currentDate - date < milliseconds);
}
