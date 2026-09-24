import "./style.css";
import { Car } from "./car";
import { NeuralNetwork } from "./network";
import { Road } from "./road";
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

const carCanvas = getCanvas("carCanvas");
carCanvas.width = 200;

const networkCanvas = getCanvas("networkCanvas");
networkCanvas.width = 500;

const carCtx = carCanvas.getContext("2d")!;
const networkCtx = networkCanvas.getContext("2d")!;
const statsDiv = document.getElementById("stats")!;

const road = new Road(carCanvas.width/2, carCanvas.width * 0.9);

const N = 100;
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

document.getElementById("skipButton")!.addEventListener("click", endGeneration);
document.getElementById("discardButton")!.addEventListener("click", discard);

startGeneration();
animate();

function startGeneration(): void {
    cars = generateCars(N);
    bestCar = cars[0];
    traffic = new TrafficGenerator(road);
    frame = 0;
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

    carCanvas.height = window.innerHeight;
    networkCanvas.height = window.innerHeight;

    carCtx.save();
    carCtx.translate(0, -bestCar.y + carCanvas.height*0.7);

    road.draw(carCtx);
    for (const t of traffic.cars) {
        t.draw(carCtx, "red");
    }

    carCtx.globalAlpha = 0.2;
    for (let i = 0; i < cars.length; i++) {
        cars[i].draw(carCtx, "blue");
    }
    carCtx.globalAlpha = 1;
    bestCar.draw(carCtx, "blue", true);

    carCtx.restore();

    if (frame % 10 === 0) {
        statsDiv.innerText =
            `Gen ${generation}\n` +
            `Alive ${alive.length}/${N}\n` +
            `Passed ${fittestCar().passed}\n` +
            `Last gen ${Math.round(lastGenerationFitness)}\n` +
            `Record ${Math.round(allTimeBestFitness)}`;
    }

    networkCtx.lineDashOffset = -time/50;
    Visualizer.drawNetwork(networkCtx, bestCar.brain!);
    requestAnimationFrame(animate);
}
