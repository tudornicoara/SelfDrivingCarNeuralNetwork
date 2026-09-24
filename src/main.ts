import "./style.css";
import { Car } from "./car";
import { Effects } from "./effects";
import { NeuralNetwork } from "./network";
import { Road, type Viewport } from "./road";
import { AI_PAINT } from "./sprites";
import { TrafficGenerator, TRAFFIC_SPEED } from "./traffic";
import { lerp } from "./utils";
import { Visualizer } from "./visualizer";

function getCanvas(id: string): HTMLCanvasElement {
    const canvas = document.getElementById(id);
    if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error(`Canvas #${id} not found`);
    }
    return canvas;
}

function getElement(id: string): HTMLElement {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Element #${id} not found`);
    }
    return element;
}

function fitCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): { width: number; height: number } {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingQuality = "high";
    return { width, height };
}

const MAX_DPR = 2;
const VIEW_WIDTH = 260;
const ROAD_WIDTH = 180;
const CAMERA_ANCHOR = 0.7;
const CAMERA_SMOOTHING = 0.2;

const carCanvas = getCanvas("carCanvas");
carCanvas.style.width = `${VIEW_WIDTH}px`;
const networkCanvas = getCanvas("networkCanvas");

const carCtx = carCanvas.getContext("2d")!;
const networkCtx = networkCanvas.getContext("2d")!;

const hud = {
    generation: getElement("statGen"),
    alive: getElement("statAlive"),
    aliveBar: getElement("aliveBar"),
    passed: getElement("statPassed"),
    score: getElement("statScore"),
    lastGen: getElement("statLast"),
    record: getElement("statRecord"),
};

const road = new Road(VIEW_WIDTH/2, ROAD_WIDTH);
const effects = new Effects();

const IS_MOBILE = window.matchMedia("(pointer: coarse)").matches;
const N = IS_MOBILE ? 40 : 100;
// Mutation amount is spread across the population: some cars stay close
// to the parent brain, others explore further away from it.
const MIN_MUTATION = 0.05;
const MAX_MUTATION = 0.3;

// Fitness = cars passed * PASS_REWARD + ground gained on the traffic flow.
// Sitting behind a car gains nothing, so only overtaking pays off.
const PASS_REWARD = 300;
// A car that overtakes nobody for this long is considered stuck and removed.
const STALL_FRAMES = 60 * 12;
// A car this far behind the leader is removed.
const LAG_DISTANCE = 400;
// Hard cap on a generation's length, in case the best car never crashes.
const MAX_GENERATION_FRAMES = 60 * 180;

const STORAGE_BRAIN = "bestBrain";
const STORAGE_GENERATION = "generation";
const STORAGE_BEST_FITNESS = "bestFitness";

let generation = Number(localStorage.getItem(STORAGE_GENERATION) ?? 1);
let allTimeBestFitness = Number(localStorage.getItem(STORAGE_BEST_FITNESS) ?? 0);
let lastGenerationFitness = 0;

let cars: Car[] = [];
let traffic: TrafficGenerator;
let bestCar: Car;
let frame = 0;
let cameraY = 0;

document.getElementById("skipButton")!.addEventListener("click", endGeneration);
document.getElementById("discardButton")!.addEventListener("click", discard);

startGeneration();
animate();

function startGeneration(): void {
    cars = generateCars(N);
    bestCar = cars[0];
    traffic = new TrafficGenerator(road);
    frame = 0;
    cameraY = bestCar.y;
    effects.clear();
}

function endGeneration(): void {
    const best = fittestCar();
    lastGenerationFitness = best.fitness;
    allTimeBestFitness = Math.max(allTimeBestFitness, best.fitness);
    generation++;

    localStorage.setItem(STORAGE_BRAIN, JSON.stringify(best.brain));
    localStorage.setItem(STORAGE_GENERATION, String(generation));
    localStorage.setItem(STORAGE_BEST_FITNESS, String(allTimeBestFitness));

    startGeneration();
}

function discard(): void {
    localStorage.removeItem(STORAGE_BRAIN);
    localStorage.removeItem(STORAGE_GENERATION);
    localStorage.removeItem(STORAGE_BEST_FITNESS);
    generation = 1;
    allTimeBestFitness = 0;
    lastGenerationFitness = 0;
    startGeneration();
}

function generateCars(N: number): Car[] {
    const savedBrain = localStorage.getItem(STORAGE_BRAIN);
    const cars: Car[] = [];
    for (let i = 0; i < N; i++) {
        const car = new Car(road.getLaneCenter(1), 100, 30, 50, "AI");
        if (savedBrain) {
            car.brain = JSON.parse(savedBrain) as NeuralNetwork;
            // Car 0 keeps the parent brain untouched, so a generation is never worse than the last
            if (i !== 0) {
                NeuralNetwork.mutate(car.brain, lerp(MIN_MUTATION, MAX_MUTATION, i/(N - 1)));
            }
        }
        cars.push(car);
    }
    return cars;
}

function fittestCar(): Car {
    return cars.reduce((best, car) => car.fitness > best.fitness ? car : best);
}

function updateFitness(car: Car): void {
    // Traffic removed from the list was behind every living car, so all of them passed it
    let passed = traffic.removedCount;
    for (const t of traffic.cars) {
        if (t.y - car.y > (t.height + car.height)/2) {
            passed++;
        }
    }

    car.framesAlive++;
    if (passed > car.passed) {
        car.passed = passed;
        car.framesSincePass = 0;
    } else {
        car.framesSincePass++;
    }

    const gainOnTraffic = (car.startY - car.y) - TRAFFIC_SPEED * car.framesAlive;
    car.fitness = car.passed * PASS_REWARD + gainOnTraffic;
}

function animate(time = 0): void {
    const alive = cars.filter(c => !c.damaged);
    const leader = alive.length > 0
        ? alive.reduce((a, b) => b.y < a.y ? b : a)
        : bestCar;
    const rearY = alive.length > 0 ? Math.max(...alive.map(c => c.y)) : leader.y;

    traffic.update(leader.y, rearY, window.innerHeight, 300);

    for (const car of alive) {
        // Only traffic within sensor range matters for sensors and collisions
        const range = car.sensor!.rayLength + car.height;
        const nearby = traffic.cars.filter(t => Math.abs(t.y - car.y) < range);
        car.update(road.borders, nearby);
        if (car.damaged) {
            effects.crash(car.x, car.y, AI_PAINT.hue, car === bestCar ? 1.6 : 0.5);
            continue;
        }

        updateFitness(car);
        if (car.framesSincePass > STALL_FRAMES || car.y > leader.y + LAG_DISTANCE) {
            car.damaged = true;
        }
    }

    frame++;
    if (cars.every(c => c.damaged) || frame >= MAX_GENERATION_FRAMES) {
        endGeneration();
        requestAnimationFrame(animate);
        return;
    }

    bestCar = leader;
    effects.update();
    drawScene(alive.length, time);
    requestAnimationFrame(animate);
}

function drawScene(aliveCount: number, time: number): void {
    const { width, height } = fitCanvas(carCanvas, carCtx);

    cameraY = Math.abs(bestCar.y - cameraY) > 300
        ? bestCar.y
        : lerp(cameraY, bestCar.y, CAMERA_SMOOTHING);
    const view: Viewport = {
        left: 0,
        right: width,
        top: cameraY - height*CAMERA_ANCHOR,
        bottom: cameraY + height*(1 - CAMERA_ANCHOR),
    };

    carCtx.save();
    carCtx.translate(0, -view.top);

    road.draw(carCtx, view);

    carCtx.globalCompositeOperation = "lighter";
    for (const t of traffic.cars) {
        t.drawBeams(carCtx);
    }
    bestCar.drawBeams(carCtx);
    if (!bestCar.damaged) {
        bestCar.drawTrail(carCtx);
    }
    carCtx.globalCompositeOperation = "source-over";

    carCtx.globalAlpha = 0.18;
    for (const car of cars) {
        if (car !== bestCar) {
            car.draw(carCtx);
        }
    }
    carCtx.globalAlpha = 1;

    for (const t of traffic.cars) {
        t.draw(carCtx);
    }
    bestCar.draw(carCtx, { hero: true, drawSensor: true });
    effects.draw(carCtx);

    carCtx.restore();
    drawVignette(carCtx, width, height);

    if (frame % 10 === 0) {
        hud.generation.textContent = String(generation);
        hud.alive.textContent = `${aliveCount}/${N}`;
        hud.aliveBar.style.width = `${aliveCount / N * 100}%`;
        const fittest = fittestCar();
        hud.passed.textContent = String(fittest.passed);
        hud.score.textContent = String(Math.round(fittest.fitness));
        hud.lastGen.textContent = String(Math.round(lastGenerationFitness));
        hud.record.textContent = String(Math.round(allTimeBestFitness));
    }

    const network = fitCanvas(networkCanvas, networkCtx);
    if (network.width === 0 || network.height === 0) {
        return;
    }
    Visualizer.drawNetwork(networkCtx, bestCar.brain!, network.width, network.height, time);
}

function drawVignette(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const vignette = ctx.createRadialGradient(
        width/2, height*CAMERA_ANCHOR, height*0.25,
        width/2, height*CAMERA_ANCHOR, height*0.9);
    vignette.addColorStop(0, "rgba(3, 4, 12, 0)");
    vignette.addColorStop(1, "rgba(3, 4, 12, 0.7)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    const haze = ctx.createLinearGradient(0, 0, 0, height*0.25);
    haze.addColorStop(0, "rgba(10, 8, 30, 0.85)");
    haze.addColorStop(1, "rgba(10, 8, 30, 0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, width, height*0.25);
}
