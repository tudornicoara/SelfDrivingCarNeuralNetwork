import type { Car } from "./car";
import { getIntersection, lerp, sensorColor, type Intersection, type Segment } from "./utils";

export const SENSOR_SPREAD = Math.PI/2;

export class Sensor {
    car: Car;
    rayCount = 5;
    rayLength = 250;
    raySpread = SENSOR_SPREAD;

    rays: Segment[] = [];
    readings: (Intersection | null)[] = [];

    constructor(car: Car) {
        this.car = car;
    }

    update(roadBorders: Segment[], traffic: Car[]): void {
        this.#castRays();
        this.readings = [];
        for (let i = 0; i < this.rays.length; i++) {
            this.readings.push(
                this.#getReading(
                    this.rays[i],
                    roadBorders,
                    traffic)
            );
        }
    }

    #getReading(ray: Segment, roadBorders: Segment[], traffic: Car[]): Intersection | null {
        const touches: Intersection[] = [];

        for (let i = 0; i < roadBorders.length; i++) {
            const touch = getIntersection(
                ray[0],
                ray[1],
                roadBorders[i][0],
                roadBorders[i][1]
            );

            if (touch) {
                touches.push(touch);
            }
        }

        for (let i = 0; i < traffic.length; i++) {
            const poly = traffic[i].polygon;
            for (let j = 0;j < poly.length; j++) {
                const value = getIntersection(
                    ray[0],
                    ray[1],
                    poly[j],
                    poly[(j+1)%poly.length]
                );
                if (value) {
                    touches.push(value);
                }
            }
        }

        if (touches.length === 0) {
            return null;
        } else {
            const offsets = touches.map(e => e.offset);
            const minOffset = Math.min(...offsets);
            return touches.find(e => e.offset === minOffset) ?? null;
        }
    }

    #castRays(): void {
        this.rays = [];
        for (let i = 0; i < this.rayCount; i++) {
            const rayAngle = lerp(
                this.raySpread/2,
                -this.raySpread/2,
                this.rayCount === 1 ? 0.5 : i/(this.rayCount - 1))
                + this.car.angle;

            const start ={x: this.car.x, y: this.car.y};
            const end = {
                x: this.car.x - Math.sin(rayAngle)*this.rayLength,
                y: this.car.y - Math.cos(rayAngle)*this.rayLength
            };
            this.rays.push([start, end]);
        }
    }

    draw(ctx: CanvasRenderingContext2D): void {
        ctx.save();
        ctx.lineCap = "round";
        for (let i = 0; i < this.rays.length; i++) {
            const [start, tip] = this.rays[i];
            const reading = this.readings[i];
            const end = reading ?? tip;
            const proximity = reading ? 1 - reading.offset : 0;

            if (reading) {
                ctx.globalCompositeOperation = "source-over";
                ctx.setLineDash([2, 5]);
                ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(end.x, end.y);
                ctx.lineTo(tip.x, tip.y);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            ctx.globalCompositeOperation = "lighter";
            const beam = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
            beam.addColorStop(0, sensorColor(proximity, 0));
            beam.addColorStop(1, sensorColor(proximity, 0.9));
            for (const [width, alpha] of [[6, 0.25], [1.5, 1]]) {
                ctx.globalAlpha = alpha;
                ctx.strokeStyle = beam;
                ctx.lineWidth = width;
                ctx.beginPath();
                ctx.moveTo(start.x, start.y);
                ctx.lineTo(end.x, end.y);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;

            if (reading) {
                const glow = ctx.createRadialGradient(end.x, end.y, 0, end.x, end.y, 10);
                glow.addColorStop(0, sensorColor(proximity, 0.8));
                glow.addColorStop(1, sensorColor(proximity, 0));
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(end.x, end.y, 10, 0, Math.PI*2);
                ctx.fill();
                ctx.fillStyle = "white";
                ctx.beginPath();
                ctx.arc(end.x, end.y, 2, 0, Math.PI*2);
                ctx.fill();
            }
        }
        ctx.restore();
    }
}
