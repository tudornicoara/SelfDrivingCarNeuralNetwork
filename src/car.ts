import { Controls, type ControlType } from "./controls";
import { NeuralNetwork } from "./network";
import { Sensor } from "./sensor";
import { polysIntersect, type Point, type Polygon, type Segment } from "./utils";

export class Car {
    x: number;
    y: number;
    width: number;
    height: number;

    speed = 0;
    acceleration = 0.2;
    maxSpeed: number;
    friction = 0.05;
    angle = 0;
    damaged = false;
    polygon: Polygon = [];

    useBrain: boolean;
    sensor?: Sensor;
    brain?: NeuralNetwork;
    controls: Controls;

    // Training bookkeeping, used to score AI cars
    startY: number;
    passed = 0;
    framesAlive = 0;
    framesSincePass = 0;
    fitness = 0;

    constructor(x: number, y: number, width: number, height: number, controlType: ControlType, maxSpeed = 3) {
        this.x = x;
        this.y = y;
        this.startY = y;
        this.width = width;
        this.height = height;
        this.maxSpeed = maxSpeed;

        this.useBrain = controlType === "AI";

        if (controlType !== "DUMMY") {
            this.sensor = new Sensor(this);
            this.brain = new NeuralNetwork(
                [this.sensor.rayCount,6,4]
            );
        }
        this.controls = new Controls(controlType);
    }

    update(roadBorders: Segment[], traffic: Car[]): void {
        if (!this.damaged) {
            this.#move();
            this.polygon = this.#createPolygon();
            this.damaged = this.#assessDamage(roadBorders, traffic);
        }
        if (this.sensor && this.brain && !this.damaged) {
            this.sensor.update(roadBorders, traffic);
            const offsets = this.sensor.readings
                .map(s => s==null ? 0 : 1-s.offset);
            const outputs = NeuralNetwork.feedForward(offsets, this.brain);

            if (this.useBrain) {
                this.controls.forward = !!outputs[0];
                this.controls.left = !!outputs[1];
                this.controls.right = !!outputs[2];
                this.controls.reverse = !!outputs[3];
            }
        }
    }

    #assessDamage(roadBorders: Segment[], traffic: Car[]): boolean {
        for (let i = 0; i < roadBorders.length; i++) {
            if (polysIntersect(this.polygon, roadBorders[i])) {
                return true;
            }
        }

        for (let i = 0; i < traffic.length; i++) {
            if (polysIntersect(this.polygon, traffic[i].polygon)) {
                return true;
            }
        }
        return false;
    }

    #createPolygon(): Polygon {
        const points: Point[] = [];
        const rad = Math.hypot(this.width, this.height)/2;
        const alpha = Math.atan2(this.width, this.height);
        points.push({
            x: this.x - Math.sin(this.angle - alpha)*rad,
            y: this.y - Math.cos(this.angle - alpha)*rad,
        });
        points.push({
            x: this.x - Math.sin(this.angle + alpha)*rad,
            y: this.y - Math.cos(this.angle + alpha)*rad,
        });
        points.push({
            x: this.x - Math.sin(Math.PI + this.angle - alpha)*rad,
            y: this.y - Math.cos(Math.PI + this.angle - alpha)*rad,
        });
        points.push({
            x: this.x - Math.sin(Math.PI + this.angle + alpha)*rad,
            y: this.y - Math.cos(Math.PI + this.angle + alpha)*rad,
        });

        return points;
    }

    #move(): void {
        if (this.controls.forward) {
            this.speed += this.acceleration;
        }

        if (this.controls.reverse) {
            this.speed -= this.acceleration;
        }

        if (this.speed > this.maxSpeed) {
            this.speed = this.maxSpeed;
        }

        if (this.speed < -this.maxSpeed/2) {
            this.speed = -this.maxSpeed/2;
        }

        if (this.speed > 0) {
            this.speed -= this.friction;
        }

        if (this.speed < 0) {
            this.speed += this.friction;
        }

        if (Math.abs(this.speed) < this.friction) {
            this.speed = 0;
        }

        if (this.speed !== 0) {
            const flip = this.speed > 0 ? 1 : -1;

            if (this.controls.left) {
                this.angle += 0.03 * flip;
            }

            if (this.controls.right) {
                this.angle -= 0.03 * flip;
            }
        }

        this.x -= Math.sin(this.angle)*this.speed;
        this.y -= Math.cos(this.angle)*this.speed;
    }

    draw(ctx: CanvasRenderingContext2D, color: string, drawSensor = false): void {
        if (this.damaged) {
            ctx.fillStyle = "gray";
        } else {
            ctx.fillStyle = color;
        }

        ctx.beginPath();
        ctx.moveTo(this.polygon[0].x, this.polygon[0].y);
        for (let i = 1; i < this.polygon.length; i++) {
            ctx.lineTo(this.polygon[i].x, this.polygon[i].y);
        }
        ctx.fill();

        if (this.sensor && drawSensor) {
            this.sensor.draw(ctx);
        }
    }
}
