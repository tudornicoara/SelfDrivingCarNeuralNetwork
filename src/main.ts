import "./style.css";
import { Car } from "./car";
import { NeuralNetwork } from "./network";
import { Road } from "./road";
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

const road = new Road(carCanvas.width/2, carCanvas.width * 0.9);

const N = 100;
const cars = generateCars(N);
let bestCar = cars[0];

const savedBrain = localStorage.getItem("bestBrain");
if (savedBrain) {
    for (let i = 0; i < cars.length; i++) {
        cars[i].brain = JSON.parse(savedBrain) as NeuralNetwork;
        if (i !== 0) {
            NeuralNetwork.mutate(cars[i].brain!, 0.1);
        }
    }
}

const traffic = [
    new Car(road.getLaneCenter(1), -100, 30, 50, "DUMMY", 2),
    new Car(road.getLaneCenter(0), -300, 30, 50, "DUMMY", 2),
    new Car(road.getLaneCenter(2), -300, 30, 50, "DUMMY", 2),
    new Car(road.getLaneCenter(0), -500, 30, 50, "DUMMY", 2),
    new Car(road.getLaneCenter(1), -500, 30, 50, "DUMMY", 2),
    new Car(road.getLaneCenter(1), -700, 30, 50, "DUMMY", 2),
    new Car(road.getLaneCenter(2), -700, 30, 50, "DUMMY", 2),
];

document.getElementById("saveButton")!.addEventListener("click", save);
document.getElementById("discardButton")!.addEventListener("click", discard);

animate();

function save(): void {
    localStorage.setItem("bestBrain", JSON.stringify(bestCar.brain));
}

function discard(): void {
    localStorage.removeItem("bestBrain");
}

function generateCars(N: number): Car[] {
    const cars: Car[] = [];
    for (let i = 0; i < N; i++) {
        cars.push(new Car(road.getLaneCenter(1), 100,30,50, "AI"));
    }
    return cars;
}

function animate(time = 0): void {
    // sleep(10);
    for (let i = 0; i < traffic.length; i++) {
        traffic[i].update(road.borders, []);
    }

    bestCar = cars.find(c => c.y === Math.min(...cars.map(c => c.y)))!;

    for (let i = 0; i < cars.length; i++) {
        cars[i].update(road.borders, traffic);
    }

    carCanvas.height = window.innerHeight;
    networkCanvas.height = window.innerHeight;

    carCtx.save();
    carCtx.translate(0, -bestCar.y + carCanvas.height*0.7);

    road.draw(carCtx);
    for (let i = 0; i < traffic.length; i++) {
        traffic[i].draw(carCtx, "red");
    }

    carCtx.globalAlpha = 0.2;
    for (let i = 0; i < cars.length; i++) {
        cars[i].draw(carCtx, "blue");
    }
    carCtx.globalAlpha = 1;
    bestCar.draw(carCtx, "blue", true);


    carCtx.restore();

    networkCtx.lineDashOffset = -time/50;
    Visualizer.drawNetwork(networkCtx, bestCar.brain!);
    requestAnimationFrame(animate);
}
