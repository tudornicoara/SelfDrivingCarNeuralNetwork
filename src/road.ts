import { lerp, type Point, type Segment } from "./utils";

export interface Viewport {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

const DASH_LENGTH = 20;
const DASH_PERIOD = 40;
const RUMBLE_WIDTH = 5;
const RUMBLE_PERIOD = 24;
const SHOULDER_WIDTH = 14;
const LAMP_SPACING = 360;
const EDGE_RGB = "255, 61, 216";
const DASH_RGB = "223, 247, 255";

export class Road {
    x: number;
    width: number;
    laneCount: number;
    left: number;
    right: number;
    top: number;
    bottom: number;
    borders: Segment[];

    #asphalt: CanvasPattern | null = null;
    #ground: CanvasPattern | null = null;
    #tireTracks: CanvasGradient | null = null;

    constructor(x: number, width: number, laneCount = 3) {
        this.x = x;
        this.width = width;
        this.laneCount = laneCount;

        this.left = x - width/2;
        this.right = x + width/2;

        const infinity = 1000000;
        this.top = -infinity;
        this.bottom = infinity;

        const topLeft: Point = {x:this.left, y:this.top};
        const topRight: Point = {x:this.right, y:this.top};
        const bottomLeft: Point = {x:this.left, y:this.bottom};
        const bottomRight: Point = {x:this.right, y:this.bottom};

        this.borders = [
            [topLeft, bottomLeft],
            [topRight, bottomRight]
        ];
    }

    getLaneCenter(laneIndex: number): number {
        const laneWidth = this.width / this.laneCount;
        return this.left + laneWidth/2 +
            Math.min(laneIndex, this.laneCount-1)*laneWidth;
    }

    draw(ctx: CanvasRenderingContext2D, view: Viewport): void {
        this.#createTextures(ctx);
        const { top, bottom } = view;
        const height = bottom - top;

        ctx.fillStyle = this.#ground!;
        ctx.fillRect(view.left, top, view.right - view.left, height);

        ctx.fillStyle = "#0e1020";
        ctx.fillRect(this.left - SHOULDER_WIDTH, top, SHOULDER_WIDTH, height);
        ctx.fillRect(this.right, top, SHOULDER_WIDTH, height);

        ctx.fillStyle = this.#asphalt!;
        ctx.fillRect(this.left, top, this.width, height);
        ctx.fillStyle = this.#tireTracks!;
        ctx.fillRect(this.left, top, this.width, height);

        this.#drawRumbleStrips(ctx, top, bottom);
        this.#drawLaneDashes(ctx, top, bottom);
        this.#drawEdgeLines(ctx, top, bottom);
        this.#drawLamps(ctx, top, bottom);
    }

    #drawRumbleStrips(ctx: CanvasRenderingContext2D, top: number, bottom: number): void {
        for (let k = Math.floor(top / RUMBLE_PERIOD); k * RUMBLE_PERIOD < bottom; k++) {
            ctx.fillStyle = k % 2 === 0 ? "#b3243f" : "#c4c6d4";
            const y = k * RUMBLE_PERIOD;
            ctx.fillRect(this.left - RUMBLE_WIDTH, y, RUMBLE_WIDTH, RUMBLE_PERIOD);
            ctx.fillRect(this.right, y, RUMBLE_WIDTH, RUMBLE_PERIOD);
        }
    }

    #drawLaneDashes(ctx: CanvasRenderingContext2D, top: number, bottom: number): void {
        for (let i = 1; i <= this.laneCount-1; i++) {
            const x = lerp(this.left, this.right, i / this.laneCount);
            // Dashes are aligned to world coordinates so they scroll with the road
            for (let k = Math.floor(top / DASH_PERIOD); k * DASH_PERIOD < bottom; k++) {
                const y = k * DASH_PERIOD;
                ctx.fillStyle = `rgba(${DASH_RGB}, 0.08)`;
                ctx.fillRect(x - 4, y - 2, 8, DASH_LENGTH + 4);
                ctx.fillStyle = `rgba(${DASH_RGB}, 0.85)`;
                ctx.fillRect(x - 1.5, y, 3, DASH_LENGTH);
            }
        }
    }

    #drawEdgeLines(ctx: CanvasRenderingContext2D, top: number, bottom: number): void {
        const strokes: [string, number][] = [
            [`rgba(${EDGE_RGB}, 0.15)`, 12],
            [`rgba(${EDGE_RGB}, 0.35)`, 5],
            [`rgba(${EDGE_RGB}, 1)`, 2.5],
            ["rgba(255, 220, 250, 0.8)", 0.8],
        ];
        for (const x of [this.left + 3, this.right - 3]) {
            for (const [color, width] of strokes) {
                ctx.strokeStyle = color;
                ctx.lineWidth = width;
                ctx.beginPath();
                ctx.moveTo(x, top);
                ctx.lineTo(x, bottom);
                ctx.stroke();
            }
        }
    }

    #drawLamps(ctx: CanvasRenderingContext2D, top: number, bottom: number): void {
        const first = Math.floor((top - LAMP_SPACING) / LAMP_SPACING);
        for (let k = first; k * LAMP_SPACING < bottom + LAMP_SPACING; k++) {
            const y = k * LAMP_SPACING;
            const side = k % 2 === 0 ? -1 : 1;
            const baseX = side < 0 ? this.left - 26 : this.right + 26;
            const headX = side < 0 ? this.left + 6 : this.right - 6;

            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            const pool = ctx.createRadialGradient(headX, y, 0, headX, y, 120);
            pool.addColorStop(0, "rgba(255, 176, 90, 0.2)");
            pool.addColorStop(0.5, "rgba(255, 150, 70, 0.07)");
            pool.addColorStop(1, "rgba(255, 150, 70, 0)");
            ctx.fillStyle = pool;
            ctx.beginPath();
            ctx.arc(headX, y, 120, 0, Math.PI*2);
            ctx.fill();
            ctx.restore();

            ctx.strokeStyle = "#2b2f44";
            ctx.lineWidth = 2.5;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(baseX, y);
            ctx.lineTo(headX, y);
            ctx.stroke();

            ctx.fillStyle = "#1c1f30";
            ctx.beginPath();
            ctx.arc(baseX, y, 4, 0, Math.PI*2);
            ctx.fill();

            ctx.fillStyle = "rgba(255, 200, 120, 0.35)";
            ctx.beginPath();
            ctx.arc(headX, y, 7, 0, Math.PI*2);
            ctx.fill();
            ctx.fillStyle = "#fff0d0";
            ctx.beginPath();
            ctx.roundRect(headX - 5, y - 2.5, 10, 5, 2);
            ctx.fill();
        }
        ctx.lineCap = "butt";
    }

    #createTextures(ctx: CanvasRenderingContext2D): void {
        if (this.#asphalt && this.#ground && this.#tireTracks) {
            return;
        }

        this.#asphalt = ctx.createPattern(noiseTexture(128, 128, [21, 23, 33], 10), "repeat");

        const ground = noiseTexture(40, 40, [8, 9, 20], 5);
        const groundCtx = ground.getContext("2d")!;
        groundCtx.fillStyle = "rgba(120, 90, 255, 0.13)";
        groundCtx.fillRect(0, 0, 40, 1);
        groundCtx.fillRect(0, 0, 1, 40);
        this.#ground = ctx.createPattern(ground, "repeat");

        const tracks = ctx.createLinearGradient(this.left, 0, this.right, 0);
        for (let lane = 0; lane < this.laneCount; lane++) {
            const at = (t: number) => (lane + t) / this.laneCount;
            tracks.addColorStop(at(0.05), "rgba(0, 0, 0, 0)");
            tracks.addColorStop(at(0.28), "rgba(0, 0, 0, 0.22)");
            tracks.addColorStop(at(0.5), "rgba(0, 0, 0, 0)");
            tracks.addColorStop(at(0.72), "rgba(0, 0, 0, 0.22)");
            tracks.addColorStop(at(0.95), "rgba(0, 0, 0, 0)");
        }
        this.#tireTracks = tracks;
    }
}

function noiseTexture(width: number, height: number, base: [number, number, number], variance: number): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    const image = ctx.createImageData(width, height);
    for (let i = 0; i < image.data.length; i += 4) {
        const speck = Math.random() < 0.01 ? 25 : 0;
        const n = (Math.random() - 0.5) * variance + speck;
        image.data[i] = base[0] + n;
        image.data[i + 1] = base[1] + n;
        image.data[i + 2] = base[2] + n;
        image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
}
