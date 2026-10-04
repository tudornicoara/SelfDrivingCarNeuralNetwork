import "./style.css";
import { BRAIN_SHAPE, Car } from "./car";
import { Effects } from "./effects";
import { NeuralNetwork } from "./network";
import { Road, type Viewport } from "./road";
import { AI_PAINT } from "./sprites";
import { TrafficGenerator, TRAFFIC_SPEED } from "./traffic";
import { lerp, seededRandom } from "./utils";
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

function fitCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): { width: number; height: number; dpr: number } {
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
    return { width, height, dpr };
}

const IS_MOBILE = window.matchMedia("(pointer: coarse)").matches;
const MAX_DPR = IS_MOBILE ? 1.5 : 2;
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
    round: getElement("statRound"),
    alive: getElement("statAlive"),
    aliveBar: getElement("aliveBar"),
    passed: getElement("statPassed"),
    score: getElement("statScore"),
    lastGen: getElement("statLast"),
    record: getElement("statRecord"),
};

const road = new Road(VIEW_WIDTH/2, ROAD_WIDTH);
const effects = new Effects();

const N = IS_MOBILE ? 40 : 100;
const ROUNDS = 3;
const ELITE_COUNT = IS_MOBILE ? 3 : 5;
const CROSSOVER_CHANCE = 0.5;
const MUTATION_RATE = 0.15;
const MIN_MUTATION = 0.05;
const MAX_MUTATION = 0.5;

// Fitness = cars passed * PASS_REWARD + ground gained on the traffic flow.
// Sitting behind a car gains nothing, so only overtaking pays off.
const PASS_REWARD = 300;
// A car that overtakes nobody for this long is considered stuck and removed.
const STALL_FRAMES = 60 * 12;
// A car this far behind the traffic flow is removed.
const LAG_DISTANCE = 400;
// Hard cap on a round's length, in case the best car never crashes.
const MAX_ROUND_FRAMES = 60 * 120;

// The simulation runs at a fixed 60 steps per second of real time, times the chosen speed,
// so training goes equally fast whatever the frame rate.
const STEPS_PER_MS = 60 / 1000;
const SPEEDS = [1, 2, 5, 10];
// Most time per frame spent simulating, leaving room to draw
const STEP_BUDGET_MS = 12;
// How far ahead of the leading car traffic is spawned
const TRAFFIC_AHEAD = 1200;

// Bump the version whenever BRAIN_SHAPE changes, so old brains are dropped
const STORAGE_PREFIX = "v2:";
const STORAGE_ELITES = STORAGE_PREFIX + "elites";
const STORAGE_GENERATION = STORAGE_PREFIX + "generation";
const STORAGE_BEST_FITNESS = STORAGE_PREFIX + "bestFitness";
for (const legacyKey of ["bestBrain", "generation", "bestFitness"]) {
    localStorage.removeItem(legacyKey);
}

let generation = Number(localStorage.getItem(STORAGE_GENERATION) ?? 1);
let allTimeBestFitness = Number(localStorage.getItem(STORAGE_BEST_FITNESS) ?? 0);
let lastGenerationFitness = 0;

let population: NeuralNetwork[] = breed(loadElites());
let totals: number[] = [];
let seeds: number[] = [];
let round = 0;

let cars: Car[] = [];
let traffic: TrafficGenerator;
let bestCar: Car;
let frame = 0;
let cameraY = 0;
let renderCount = 0;

let speedIndex = 0;
let stepBacklog = 0;
let lastTime = 0;

let vignetteCache: { canvas: HTMLCanvasElement; key: string } | null = null;

const speedButton = getElement("speedButton");
speedButton.addEventListener("click", () => {
    speedIndex = (speedIndex + 1) % SPEEDS.length;
    speedButton.textContent = `⏩ Speed ${SPEEDS[speedIndex]}×`;
});
document.getElementById("skipButton")!.addEventListener("click", skipGeneration);
document.getElementById("discardButton")!.addEventListener("click", discard);

startGeneration();
requestAnimationFrame(time => {
    lastTime = time;
    requestAnimationFrame(animate);
});

function startGeneration(): void {
    totals = population.map(() => 0);
    seeds = Array.from({ length: ROUNDS }, () => Math.floor(Math.random() * 2**32));
    round = 0;
    startRound();
}

function startRound(): void {
    cars = population.map(brain => {
        const car = new Car(road.getLaneCenter(1), 100, 30, 50, "AI");
        car.brain = brain;
        return car;
    });
    bestCar = cars[0];
    traffic = new TrafficGenerator(road, seededRandom(seeds[round]));
    frame = 0;
    cameraY = bestCar.y;
    effects.clear();
}

function finishRound(): void {
    cars.forEach((car, i) => totals[i] += car.fitness);
    round++;
}

function nextRound(): void {
    finishRound();
    if (round < ROUNDS) {
        startRound();
    } else {
        endGeneration();
    }
}

function skipGeneration(): void {
    // Score on the rounds played so far, including the current one
    finishRound();
    endGeneration();
}

function endGeneration(): void {
    const ranked = population
        .map((brain, i) => ({ brain, fitness: totals[i] / round }))
        .sort((a, b) => b.fitness - a.fitness);
    const elites = ranked.slice(0, ELITE_COUNT).map(r => r.brain);

    lastGenerationFitness = ranked[0].fitness;
    allTimeBestFitness = Math.max(allTimeBestFitness, lastGenerationFitness);
    generation++;

    localStorage.setItem(STORAGE_ELITES, JSON.stringify(elites));
    localStorage.setItem(STORAGE_GENERATION, String(generation));
    localStorage.setItem(STORAGE_BEST_FITNESS, String(allTimeBestFitness));

    population = breed(elites);
    startGeneration();
}

function discard(): void {
    localStorage.removeItem(STORAGE_ELITES);
    localStorage.removeItem(STORAGE_GENERATION);
    localStorage.removeItem(STORAGE_BEST_FITNESS);
    generation = 1;
    allTimeBestFitness = 0;
    lastGenerationFitness = 0;
    population = breed([]);
    startGeneration();
}

function loadElites(): NeuralNetwork[] {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_ELITES) ?? "[]") as NeuralNetwork[];
        return saved.filter(brain => NeuralNetwork.hasShape(brain, BRAIN_SHAPE));
    } catch {
        return [];
    }
}

// Builds a population of N brains: the elites unchanged, then mutated children of them
function breed(elites: NeuralNetwork[]): NeuralNetwork[] {
    if (elites.length === 0) {
        return Array.from({ length: N }, () => new NeuralNetwork(BRAIN_SHAPE));
    }

    const brains = elites.map(NeuralNetwork.clone);
    const childCount = N - brains.length;
    for (let i = 0; i < childCount; i++) {
        const parent = pickParent(elites);
        const child = elites.length > 1 && Math.random() < CROSSOVER_CHANCE
            ? NeuralNetwork.crossover(parent, pickParent(elites))
            : NeuralNetwork.clone(parent);
        const strength = lerp(MIN_MUTATION, MAX_MUTATION, childCount > 1 ? i/(childCount - 1) : 0);
        NeuralNetwork.mutate(child, MUTATION_RATE, strength);
        brains.push(child);
    }
    return brains;
}

function pickParent(elites: NeuralNetwork[]): NeuralNetwork {
    return elites[Math.floor(Math.random()**2 * elites.length)];
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

function animate(time: number): void {
    stepBacklog += Math.min(time - lastTime, 250) * STEPS_PER_MS * SPEEDS[speedIndex];
    lastTime = time;
    const deadline = performance.now() + STEP_BUDGET_MS;
    while (stepBacklog >= 1) {
        step();
        stepBacklog--;
        if (performance.now() > deadline) {
            stepBacklog = 0;
        }
    }

    drawScene(cars.filter(c => !c.damaged).length, time);
    requestAnimationFrame(animate);
}

function step(): void {
    const alive = cars.filter(c => !c.damaged);
    const leader = alive.length > 0
        ? alive.reduce((a, b) => b.y < a.y ? b : a)
        : bestCar;
    const rearY = alive.length > 0 ? Math.max(...alive.map(c => c.y)) : leader.y;

    traffic.update(leader.y, rearY, TRAFFIC_AHEAD, 300);

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
        const flowY = car.startY - TRAFFIC_SPEED * car.framesAlive;
        if (car.framesSincePass > STALL_FRAMES || car.y > flowY + LAG_DISTANCE) {
            car.damaged = true;
        }
    }

    frame++;
    if (cars.every(c => c.damaged) || frame >= MAX_ROUND_FRAMES) {
        nextRound();
        return;
    }

    bestCar = leader;
    effects.update();
}

function drawScene(aliveCount: number, time: number): void {
    const { width, height, dpr } = fitCanvas(carCanvas, carCtx);

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
    carCtx.drawImage(getVignette(width, height, dpr), 0, 0, width, height);

    if (renderCount++ % 10 === 0) {
        hud.generation.textContent = String(generation);
        hud.round.textContent = `${Math.min(round + 1, ROUNDS)}/${ROUNDS}`;
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

function getVignette(width: number, height: number, dpr: number): HTMLCanvasElement {
    const key = `${width}x${height}@${dpr}`;
    if (vignetteCache?.key !== key) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * dpr));
        canvas.height = Math.max(1, Math.round(height * dpr));
        const ctx = canvas.getContext("2d")!;
        ctx.scale(dpr, dpr);
        drawVignette(ctx, width, height);
        vignetteCache = { canvas, key };
    }
    return vignetteCache.canvas;
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
