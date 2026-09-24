import { Car } from "./car";
import type { Road } from "./road";

export const TRAFFIC_SPEED = 2;

const MIN_ROW_GAP = 220;
const MAX_ROW_GAP = 320;
// Extra room per lane the free gap shifts sideways between rows,
// so a car always has space to change lanes and squeeze through.
const GAP_PER_LANE_SHIFT = 80;
// Probability a row blocks all lanes but one (otherwise it blocks just one lane).
const TWO_CAR_ROW_CHANCE = 0.7;

export class TrafficGenerator {
    road: Road;
    cars: Car[] = [];
    // Number of traffic cars removed behind every living AI car (i.e. passed by all of them).
    removedCount = 0;

    #lastRow: Car[] = [];
    #lastFreeLanes: number[] = [];

    constructor(road: Road) {
        this.road = road;
    }

    // Spawns rows ahead of `frontY` until `aheadDistance` is covered,
    // and drops cars that are more than `behindDistance` behind `rearY`.
    update(frontY: number, rearY: number, aheadDistance: number, behindDistance: number): void {
        // Spawn before updating so new cars get their polygon before being drawn
        while (this.#lastRowY() > frontY - aheadDistance) {
            this.#spawnRow();
        }

        for (let i = 0; i < this.cars.length; i++) {
            this.cars[i].update(this.road.borders, []);
        }

        const kept = this.cars.filter(c => c.y < rearY + behindDistance);
        this.removedCount += this.cars.length - kept.length;
        this.cars = kept;
    }

    #lastRowY(): number {
        if (this.#lastRow.length === 0) {
            return Infinity;
        }
        return this.#lastRow[0].y;
    }

    #spawnRow(): void {
        const laneCount = this.road.laneCount;
        const lanes = shuffle([...Array(laneCount).keys()]);
        const blockedCount = laneCount > 1 && Math.random() < TWO_CAR_ROW_CHANCE
            ? laneCount - 1
            : 1;
        const blocked = lanes.slice(0, blockedCount);
        const free = lanes.slice(blockedCount);

        let y: number;
        if (this.#lastRow.length === 0) {
            y = -100;
        } else {
            y = this.#lastRowY() - (MIN_ROW_GAP + Math.random()*(MAX_ROW_GAP - MIN_ROW_GAP))
                - GAP_PER_LANE_SHIFT * minLaneShift(this.#lastFreeLanes, free);
        }

        this.#lastRow = blocked.map(lane =>
            new Car(this.road.getLaneCenter(lane), y, 30, 50, "DUMMY", TRAFFIC_SPEED)
        );
        this.#lastFreeLanes = free;
        this.cars.push(...this.#lastRow);
    }
}

function minLaneShift(from: number[], to: number[]): number {
    let best = Infinity;
    for (const a of from) {
        for (const b of to) {
            best = Math.min(best, Math.abs(a - b));
        }
    }
    return best === Infinity ? 0 : best;
}

function shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
