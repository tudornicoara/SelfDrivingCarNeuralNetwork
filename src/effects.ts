interface Particle {
    kind: "spark" | "smoke" | "ring";
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    size: number;
    color: string;
}

const MAX_PARTICLES = 700;
const DRAG = 0.93;

export class Effects {
    #particles: Particle[] = [];

    // Burst of sparks, smoke and a shockwave ring. `intensity` scales the size of the burst.
    crash(x: number, y: number, hue: number, intensity = 1): void {
        if (this.#particles.length >= MAX_PARTICLES) {
            return;
        }

        this.#particles.push({
            kind: "ring", x, y, vx: 0, vy: 0,
            life: 24, maxLife: 24, size: 28 * intensity,
            color: `hsl(${hue}, 100%, 65%)`,
        });

        for (let i = 0; i < 3; i++) {
            const life = 50 + Math.random() * 30;
            this.#particles.push({
                kind: "smoke", x, y,
                vx: (Math.random() - 0.5) * 0.8,
                vy: (Math.random() - 0.5) * 0.8,
                life, maxLife: life,
                size: 5 + Math.random() * 5 * intensity,
                color: "",
            });
        }

        const sparks = Math.round(16 * intensity);
        for (let i = 0; i < sparks; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1.5 + Math.random() * 4 * intensity;
            const life = 18 + Math.random() * 26;
            // Mix of the car's own color and hot orange
            const sparkHue = Math.random() < 0.5 ? hue : 25 + Math.random() * 25;
            this.#particles.push({
                kind: "spark", x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life, maxLife: life,
                size: 1 + Math.random() * 1.5,
                color: `hsl(${sparkHue}, 100%, ${60 + Math.random() * 25}%)`,
            });
        }
    }

    update(): void {
        for (const p of this.#particles) {
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= DRAG;
            p.vy *= DRAG;
            p.life--;
            if (p.kind === "smoke") {
                p.size += 0.35;
            }
        }
        this.#particles = this.#particles.filter(p => p.life > 0);
    }

    clear(): void {
        this.#particles = [];
    }

    draw(ctx: CanvasRenderingContext2D): void {
        ctx.save();
        for (const p of this.#particles) {
            if (p.kind === "smoke") {
                ctx.fillStyle = `rgba(30, 30, 45, ${0.4 * p.life / p.maxLife})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
                ctx.fill();
            }
        }

        ctx.globalCompositeOperation = "lighter";
        ctx.lineCap = "round";
        for (const p of this.#particles) {
            const fade = p.life / p.maxLife;
            if (p.kind === "spark") {
                ctx.globalAlpha = fade;
                ctx.strokeStyle = p.color;
                ctx.lineWidth = p.size;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x - p.vx * 3, p.y - p.vy * 3);
                ctx.stroke();
            } else if (p.kind === "ring") {
                const t = 1 - fade;
                ctx.globalAlpha = fade;
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 3 * fade + 0.5;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * (0.2 + t), 0, Math.PI*2);
                ctx.stroke();
            }
        }
        ctx.restore();
    }
}
