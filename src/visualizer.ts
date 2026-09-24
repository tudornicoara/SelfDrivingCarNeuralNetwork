import type { Level, NeuralNetwork } from "./network";
import { SENSOR_SPREAD } from "./sensor";
import { lerp, sensorColor, type Point } from "./utils";

type RGB = [number, number, number];

const POSITIVE: RGB = [0, 229, 255];
const NEGATIVE: RGB = [255, 61, 216];

const NODE_RADIUS = 15;
const MARGIN_LEFT = 64;
const MARGIN_RIGHT = 40;
const MARGIN_TOP = 110;
const MARGIN_BOTTOM = 90;

const OUTPUT_LABELS = ["GAS", "LEFT", "RIGHT", "BRAKE"];
const OUTPUT_ARROWS = [0, -Math.PI/2, Math.PI/2, Math.PI];

const TITLE_FONT = "700 14px 'Orbitron', sans-serif";
const MONO_FONT = "'JetBrains Mono', monospace";

let background: { canvas: HTMLCanvasElement; width: number; height: number; scale: number } | null = null;

function rgba([r, g, b]: RGB, alpha: number): string {
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function weightColor(value: number, alpha: number): string {
    return rgba(value >= 0 ? POSITIVE : NEGATIVE, alpha);
}

function nodeX(count: number, index: number, left: number, right: number): number {
    return lerp(left, right, count === 1 ? 0.5 : index/(count - 1));
}

function bezierPoint(x1: number, y1: number, x2: number, y2: number, t: number): Point {
    // Control points sit halfway vertically, making an S-curve between the two nodes
    const midY = (y1 + y2)/2;
    const u = 1 - t;
    return {
        x: u*u*u*x1 + 3*u*u*t*x1 + 3*u*t*t*x2 + t*t*t*x2,
        y: u*u*u*y1 + 3*u*u*t*midY + 3*u*t*t*midY + t*t*t*y2,
    };
}

function traceConnection(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
    const midY = (y1 + y2)/2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x1, midY, x2, midY, x2, y2);
}

export class Visualizer {
    static drawNetwork(ctx: CanvasRenderingContext2D, network: NeuralNetwork, width: number, height: number, time: number): void {
        Visualizer.#drawBackground(ctx, width, height);
        Visualizer.#drawHeader(ctx, width);

        const { levels } = network;
        const left = MARGIN_LEFT;
        const right = width - MARGIN_RIGHT;
        const rowY = (row: number) => lerp(height - MARGIN_BOTTOM, MARGIN_TOP, row / levels.length);

        for (let i = 0; i < levels.length; i++) {
            Visualizer.#drawConnections(ctx, levels[i], left, right, rowY(i), rowY(i + 1), time);
        }

        for (let row = 0; row <= levels.length; row++) {
            const isInput = row === 0;
            const isOutput = row === levels.length;
            const values = isInput ? levels[0].inputs : levels[row - 1].outputs;
            const biases = isInput ? null : levels[row - 1].biases;
            const y = rowY(row);

            Visualizer.#drawRowLabel(ctx, isInput ? "SENSORS" : isOutput ? "CONTROLS" : "HIDDEN", y);

            for (let i = 0; i < values.length; i++) {
                const x = nodeX(values.length, i, left, right);
                const value = values[i] ?? 0;
                const color = isInput
                    ? (alpha: number) => sensorColor(value, alpha)
                    : (alpha: number) => rgba(POSITIVE, alpha);
                Visualizer.#drawNode(ctx, x, y, value, biases?.[i], color, time);

                if (isInput) {
                    Visualizer.#drawInputGlyph(ctx, x, y, i, values.length, value);
                }
                if (isOutput) {
                    Visualizer.#drawOutputGlyph(ctx, x, y, i, value);
                }
            }
        }
    }

    static #drawConnections(
        ctx: CanvasRenderingContext2D,
        level: Level,
        left: number,
        right: number,
        bottom: number,
        top: number,
        time: number
    ): void {
        const { inputs, outputs, weights } = level;
        ctx.save();
        ctx.lineCap = "round";

        for (let i = 0; i < inputs.length; i++) {
            for (let j = 0; j < outputs.length; j++) {
                const w = weights[i][j];
                traceConnection(ctx, nodeX(inputs.length, i, left, right), bottom, nodeX(outputs.length, j, left, right), top);
                ctx.strokeStyle = weightColor(w, 0.06 + Math.abs(w)*0.3);
                ctx.lineWidth = 0.5 + Math.abs(w)*1.5;
                ctx.stroke();
            }
        }

        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < inputs.length; i++) {
            for (let j = 0; j < outputs.length; j++) {
                const w = weights[i][j];
                const strength = Math.abs((inputs[i] ?? 0) * w);
                if (strength < 0.05) {
                    continue;
                }
                const x1 = nodeX(inputs.length, i, left, right);
                const x2 = nodeX(outputs.length, j, left, right);

                traceConnection(ctx, x1, bottom, x2, top);
                ctx.strokeStyle = weightColor(w, strength*0.3);
                ctx.lineWidth = 6;
                ctx.stroke();
                ctx.strokeStyle = weightColor(w, 0.35 + strength*0.5);
                ctx.lineWidth = 1.2;
                ctx.stroke();

                const speed = 0.3 + strength*0.5;
                const phase = (i*7 + j*13) * 0.071;
                for (let k = 0; k < 2; k++) {
                    const t = (time/1000*speed + phase + k/2) % 1;
                    const p = bezierPoint(x1, bottom, x2, top, t);
                    ctx.fillStyle = weightColor(w, 0.25);
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 5, 0, Math.PI*2);
                    ctx.fill();
                    ctx.fillStyle = weightColor(w, 0.95);
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 1.8 + strength, 0, Math.PI*2);
                    ctx.fill();
                }
            }
        }
        ctx.restore();
    }

    static #drawNode(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        value: number,
        bias: number | undefined,
        color: (alpha: number) => string,
        time: number
    ): void {
        const r = NODE_RADIUS;
        ctx.save();

        if (value > 0) {
            ctx.globalCompositeOperation = "lighter";
            const pulse = 0.8 + 0.2*Math.sin(time/180 + x);
            const glow = ctx.createRadialGradient(x, y, r*0.5, x, y, r*2.8);
            glow.addColorStop(0, color(0.5*value*pulse));
            glow.addColorStop(1, color(0));
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(x, y, r*2.8, 0, Math.PI*2);
            ctx.fill();
            ctx.globalCompositeOperation = "source-over";
        }

        const shell = ctx.createRadialGradient(x - r*0.3, y - r*0.3, r*0.1, x, y, r);
        shell.addColorStop(0, "#1e2850");
        shell.addColorStop(1, "#070a18");
        ctx.fillStyle = shell;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI*2);
        ctx.fill();
        ctx.strokeStyle = "rgba(140, 160, 255, 0.28)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        if (value > 0) {
            ctx.fillStyle = color(value);
            ctx.beginPath();
            ctx.arc(x, y, r*0.62, 0, Math.PI*2);
            ctx.fill();
            ctx.fillStyle = `rgba(255, 255, 255, ${0.55*value})`;
            ctx.beginPath();
            ctx.arc(x - r*0.2, y - r*0.2, r*0.18, 0, Math.PI*2);
            ctx.fill();
        }

        if (bias !== undefined) {
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
            ctx.beginPath();
            ctx.arc(x, y, r + 5, 0, Math.PI*2);
            ctx.stroke();

            const start = -Math.PI/2;
            ctx.lineCap = "round";
            ctx.strokeStyle = weightColor(bias, 0.9);
            ctx.beginPath();
            ctx.arc(x, y, r + 5, start, start + bias*Math.PI*2, bias < 0);
            ctx.stroke();
        }
        ctx.restore();
    }

    static #drawInputGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, index: number, count: number, value: number): void {
        const angle = lerp(SENSOR_SPREAD/2, -SENSOR_SPREAD/2, count === 1 ? 0.5 : index/(count - 1));
        const originY = y + NODE_RADIUS + 36;
        const len = 16;

        ctx.save();
        ctx.lineCap = "round";
        ctx.strokeStyle = sensorColor(value, 0.9);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, originY);
        ctx.lineTo(x - Math.sin(angle)*len, originY - Math.cos(angle)*len);
        ctx.stroke();
        ctx.fillStyle = "#e8ecff";
        ctx.beginPath();
        ctx.arc(x, originY, 2.2, 0, Math.PI*2);
        ctx.fill();

        const barWidth = 30;
        const barY = originY + 10;
        ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
        ctx.beginPath();
        ctx.roundRect(x - barWidth/2, barY, barWidth, 3, 1.5);
        ctx.fill();
        if (value > 0) {
            ctx.fillStyle = sensorColor(value);
            ctx.beginPath();
            ctx.roundRect(x - barWidth/2, barY, barWidth*value, 3, 1.5);
            ctx.fill();
        }
        ctx.restore();
    }

    static #drawOutputGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, index: number, value: number): void {
        const active = value > 0;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(OUTPUT_ARROWS[index] ?? 0);
        ctx.strokeStyle = active ? "#021017" : "rgba(200, 215, 255, 0.45)";
        ctx.lineWidth = 2.2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(0, 6);
        ctx.lineTo(0, -6);
        ctx.moveTo(-5, -1);
        ctx.lineTo(0, -6);
        ctx.lineTo(5, -1);
        ctx.stroke();
        ctx.restore();

        const label = OUTPUT_LABELS[index];
        if (label) {
            ctx.fillStyle = active ? rgba(POSITIVE, 1) : "rgba(160, 175, 220, 0.5)";
            ctx.font = `600 10px ${MONO_FONT}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.fillText(label, x, y - NODE_RADIUS - 12);
        }
    }

    static #drawRowLabel(ctx: CanvasRenderingContext2D, label: string, y: number): void {
        ctx.save();
        ctx.translate(24, y);
        ctx.rotate(-Math.PI/2);
        ctx.fillStyle = "rgba(140, 155, 210, 0.55)";
        ctx.font = `600 9px ${MONO_FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label.split("").join(" "), 0, 0);
        ctx.restore();
    }

    static #drawHeader(ctx: CanvasRenderingContext2D, width: number): void {
        ctx.save();
        ctx.textBaseline = "alphabetic";
        ctx.textAlign = "left";
        ctx.shadowColor = rgba(POSITIVE, 0.6);
        ctx.shadowBlur = 12;
        ctx.fillStyle = "#eef2ff";
        ctx.font = TITLE_FONT;
        ctx.fillText("NEURAL NETWORK", 24, 38);
        ctx.shadowBlur = 0;

        ctx.fillStyle = "rgba(150, 165, 215, 0.7)";
        ctx.font = `10px ${MONO_FONT}`;
        ctx.fillText("brain of the leading car", 24, 56);

        ctx.textAlign = "right";
        const legend: [string, RGB, number][] = [["excite", POSITIVE, 34], ["inhibit", NEGATIVE, 52]];
        for (const [text, color, y] of legend) {
            ctx.fillStyle = "rgba(190, 200, 240, 0.75)";
            ctx.fillText(text, width - 24, y);
            ctx.strokeStyle = rgba(color, 0.9);
            ctx.lineWidth = 2;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(width - 94, y - 3.5);
            ctx.lineTo(width - 76, y - 3.5);
            ctx.stroke();
        }

        const divider = ctx.createLinearGradient(24, 0, width - 24, 0);
        divider.addColorStop(0, rgba(POSITIVE, 0.5));
        divider.addColorStop(0.5, "rgba(140, 160, 255, 0.15)");
        divider.addColorStop(1, rgba(NEGATIVE, 0.5));
        ctx.fillStyle = divider;
        ctx.fillRect(24, 70, width - 48, 1);
        ctx.restore();
    }

    static #drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        const scale = ctx.getTransform().a;
        if (!background || background.width !== width || background.height !== height || background.scale !== scale) {
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(width*scale);
            canvas.height = Math.round(height*scale);
            const bg = canvas.getContext("2d")!;
            bg.scale(scale, scale);

            const fill = bg.createLinearGradient(0, 0, 0, height);
            fill.addColorStop(0, "#0c1028");
            fill.addColorStop(1, "#04050c");
            bg.fillStyle = fill;
            bg.fillRect(0, 0, width, height);

            bg.fillStyle = "rgba(120, 140, 255, 0.1)";
            for (let x = 12; x < width; x += 24) {
                for (let y = 12; y < height; y += 24) {
                    bg.fillRect(x, y, 1, 1);
                }
            }

            const vignette = bg.createRadialGradient(width/2, height/2, Math.min(width, height)*0.3, width/2, height/2, Math.max(width, height)*0.75);
            vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
            vignette.addColorStop(1, "rgba(0, 0, 0, 0.6)");
            bg.fillStyle = vignette;
            bg.fillRect(0, 0, width, height);

            background = { canvas, width, height, scale };
        }
        ctx.drawImage(background.canvas, 0, 0, width, height);
    }
}
