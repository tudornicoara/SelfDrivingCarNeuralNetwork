export interface Paint {
    hue: number;
    sat: number;
    light: number;
}

export const AI_PAINT: Paint = { hue: 188, sat: 100, light: 48 };

const TRAFFIC_PAINTS: Paint[] = [
    { hue: 350, sat: 85, light: 50 }, // red
    { hue: 24, sat: 95, light: 52 },  // orange
    { hue: 46, sat: 95, light: 52 },  // yellow
    { hue: 145, sat: 55, light: 42 }, // green
    { hue: 220, sat: 12, light: 82 }, // silver
    { hue: 265, sat: 60, light: 56 }, // purple
    { hue: 225, sat: 14, light: 28 }, // graphite
    { hue: 212, sat: 80, light: 48 }, // blue
];

export function randomTrafficPaint(): Paint {
    return TRAFFIC_PAINTS[Math.floor(Math.random() * TRAFFIC_PAINTS.length)];
}

export function hsl(paint: Paint, lightOffset = 0, alpha = 1): string {
    const light = Math.max(0, Math.min(100, paint.light + lightOffset));
    return `hsla(${paint.hue}, ${paint.sat}%, ${light}%, ${alpha})`;
}

export type CarVariant = "normal" | "hero" | "wreck";

const SPRITE_SCALE = Math.max(2, Math.ceil(window.devicePixelRatio || 1));
export const SPRITE_PAD = 14;

export const BEAM_LENGTH = 130;
export const BEAM_WIDTH = 90;

const carSprites = new Map<string, HTMLCanvasElement>();
let beamSprite: HTMLCanvasElement | null = null;

export function getCarSprite(width: number, height: number, paint: Paint, variant: CarVariant): HTMLCanvasElement {
    const key = `${width}x${height}|${paint.hue},${paint.sat},${paint.light}|${variant}`;
    let sprite = carSprites.get(key);
    if (!sprite) {
        sprite = createSprite(width + SPRITE_PAD*2, height + SPRITE_PAD*2, ctx => {
            ctx.translate(width/2 + SPRITE_PAD, height/2 + SPRITE_PAD);
            paintCar(ctx, width, height, paint, variant);
        });
        carSprites.set(key, sprite);
    }
    return sprite;
}

export function getBeamSprite(): HTMLCanvasElement {
    if (!beamSprite) {
        beamSprite = createSprite(BEAM_WIDTH, BEAM_LENGTH, ctx => {
            for (const side of [-1, 1]) {
                const x0 = BEAM_WIDTH/2 + side*9;
                const y0 = BEAM_LENGTH;
                const glow = ctx.createRadialGradient(x0, y0, 0, x0, y0, BEAM_LENGTH);
                glow.addColorStop(0, "rgba(255, 236, 190, 0.5)");
                glow.addColorStop(0.35, "rgba(255, 236, 190, 0.16)");
                glow.addColorStop(1, "rgba(255, 236, 190, 0)");
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.moveTo(x0 - 3, y0);
                ctx.lineTo(x0 + side*6 - 26, 0);
                ctx.lineTo(x0 + side*6 + 26, 0);
                ctx.lineTo(x0 + 3, y0);
                ctx.fill();
            }
        });
    }
    return beamSprite;
}

function createSprite(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * SPRITE_SCALE);
    canvas.height = Math.ceil(height * SPRITE_SCALE);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(SPRITE_SCALE, SPRITE_SCALE);
    draw(ctx);
    return canvas;
}

function paintCar(ctx: CanvasRenderingContext2D, w: number, h: number, paint: Paint, variant: CarVariant): void {
    const wreck = variant === "wreck";
    const body: Paint = wreck ? { hue: paint.hue, sat: paint.sat * 0.12, light: 20 } : paint;
    const blur = (px: number) => px * SPRITE_SCALE;

    ctx.save();
    if (variant === "hero") {
        // Neon underglow
        ctx.shadowColor = hsl(paint, 10);
        ctx.shadowBlur = blur(12);
        ctx.fillStyle = hsl(paint, 5, 0.9);
        ctx.beginPath();
        ctx.roundRect(-w/2 + 1, -h/2 + 3, w - 2, h - 6, 6);
        ctx.fill();
        ctx.fill();
    } else {
        // Soft contact shadow
        ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
        ctx.shadowBlur = blur(6);
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.beginPath();
        ctx.roundRect(-w/2, -h/2 + 1, w, h, 6);
        ctx.fill();
    }
    ctx.restore();

    // Wheels, peeking out from under the body
    const wheelW = 4;
    const wheelH = h * 0.2;
    ctx.fillStyle = "#06070b";
    for (const wy of [-h*0.29, h*0.28]) {
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.roundRect(side*(w/2 - wheelW/2 + 1) - wheelW/2, wy - wheelH/2, wheelW, wheelH, 1.5);
            ctx.fill();
        }
    }

    // Body, shaded to look rounded
    const bodyGrad = ctx.createLinearGradient(-w/2, 0, w/2, 0);
    bodyGrad.addColorStop(0, hsl(body, -22));
    bodyGrad.addColorStop(0.18, hsl(body, -4));
    bodyGrad.addColorStop(0.5, hsl(body, 10));
    bodyGrad.addColorStop(0.82, hsl(body, -4));
    bodyGrad.addColorStop(1, hsl(body, -22));
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(-w/2, -h/2, w, h, [w*0.4, w*0.4, w*0.28, w*0.28]);
    ctx.fill();
    ctx.strokeStyle = hsl(body, 28, 0.35);
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Side mirrors
    ctx.fillStyle = hsl(body, -12);
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side*(w/2 + 1), -h*0.13, 2, 1.4, 0, 0, Math.PI*2);
        ctx.fill();
    }

    // Hood creases
    const glassTop = -h*0.2;
    const glassBottom = h*0.3;
    ctx.strokeStyle = hsl(body, 20, 0.3);
    ctx.lineWidth = 0.7;
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side*w*0.18, -h/2 + 4);
        ctx.lineTo(side*w*0.22, glassTop - 2);
        ctx.stroke();
    }

    // Glass: windshield, side windows and rear window in one piece, the roof covers the middle
    const glass = ctx.createLinearGradient(0, glassTop, 0, glassBottom);
    if (wreck) {
        glass.addColorStop(0, "#1b1b1f");
        glass.addColorStop(1, "#0d0d10");
    } else {
        glass.addColorStop(0, "#2a3d5c");
        glass.addColorStop(0.45, "#0b1220");
        glass.addColorStop(1, "#1a2842");
    }
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.roundRect(-w/2 + 3.5, glassTop, w - 7, glassBottom - glassTop, [6, 6, 4, 4]);
    ctx.fill();

    // Windshield glint
    ctx.strokeStyle = wreck ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-w*0.22, glassTop + 5);
    ctx.lineTo(w*0.02, glassTop + 1.8);
    ctx.stroke();

    // Roof
    const roofGrad = ctx.createLinearGradient(-w/2, 0, w/2, 0);
    roofGrad.addColorStop(0, hsl(body, -10));
    roofGrad.addColorStop(0.5, hsl(body, 8));
    roofGrad.addColorStop(1, hsl(body, -10));
    ctx.fillStyle = roofGrad;
    ctx.beginPath();
    ctx.roundRect(-w/2 + 5, -h*0.07, w - 10, h*0.27, 3);
    ctx.fill();

    if (wreck) {
        // Scorch mark
        const scorch = ctx.createRadialGradient(w*0.1, -h*0.1, 0, w*0.1, -h*0.1, w*0.6);
        scorch.addColorStop(0, "rgba(0, 0, 0, 0.7)");
        scorch.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = scorch;
        ctx.beginPath();
        ctx.roundRect(-w/2, -h/2, w, h, [w*0.4, w*0.4, w*0.28, w*0.28]);
        ctx.fill();
    }

    // Headlights
    ctx.save();
    if (!wreck) {
        ctx.shadowColor = "rgba(255, 240, 200, 0.95)";
        ctx.shadowBlur = blur(5);
    }
    ctx.fillStyle = wreck ? "#2e2e33" : "#fff6dc";
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.roundRect(side > 0 ? w/2 - 9 : -w/2 + 3, -h/2 + 1.5, 6, 2.6, 1.3);
        ctx.fill();
    }
    ctx.restore();

    // Taillights
    ctx.save();
    if (!wreck) {
        ctx.shadowColor = "rgba(255, 30, 60, 0.95)";
        ctx.shadowBlur = blur(6);
    }
    ctx.fillStyle = wreck ? "#2a1115" : "#ff2d4a";
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.roundRect(side > 0 ? w/2 - 9 : -w/2 + 3, h/2 - 3.5, 6, 2, 1);
        ctx.fill();
    }
    ctx.restore();
}
