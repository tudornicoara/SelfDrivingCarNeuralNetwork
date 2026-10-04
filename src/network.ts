import { clamp, gaussian } from "./utils";

export class NeuralNetwork {
    levels: Level[];

    constructor(neuronCounts: number[]) {
        this.levels = [];
        for (let i = 0; i < neuronCounts.length-1; i++) {
            this.levels.push(new Level(
                neuronCounts[i], neuronCounts[i+1]
            ));
        }
    }

    static feedForward(givenInputs: number[], network: NeuralNetwork): number[] {
        let outputs = Level.feedForward(
            givenInputs, network.levels[0]
        );

        for (let i = 1; i < network.levels.length; i++) {
            outputs = Level.feedForward(
                outputs, network.levels[i]
            );
        }

        return outputs;
    }

    static clone(network: NeuralNetwork): NeuralNetwork {
        return JSON.parse(JSON.stringify(network)) as NeuralNetwork;
    }

    static mutate(network: NeuralNetwork, rate: number, strength: number): void {
        const nudge = (value: number) => Math.random() < rate
            ? clamp(value + gaussian()*strength, -1, 1)
            : value;

        network.levels.forEach(level => {
            for (let i = 0; i < level.biases.length; i++) {
                level.biases[i] = nudge(level.biases[i]);
            }

            for (let i = 0; i < level.weights.length; i++) {
                for (let j = 0; j < level.weights[i].length; j++) {
                    level.weights[i][j] = nudge(level.weights[i][j]);
                }
            }
        });
    }

    static crossover(a: NeuralNetwork, b: NeuralNetwork): NeuralNetwork {
        const child = NeuralNetwork.clone(a);
        child.levels.forEach((level, l) => {
            const other = b.levels[l];
            for (let j = 0; j < level.biases.length; j++) {
                if (Math.random() < 0.5) {
                    level.biases[j] = other.biases[j];
                    for (let i = 0; i < level.weights.length; i++) {
                        level.weights[i][j] = other.weights[i][j];
                    }
                }
            }
        });
        return child;
    }
    
    static hasShape(network: NeuralNetwork, neuronCounts: number[]): boolean {
        return network.levels?.length === neuronCounts.length - 1
            && network.levels.every((level, i) =>
                level.weights.length === neuronCounts[i] && level.biases.length === neuronCounts[i+1]);
    }
}

export class Level {
    inputs: number[];
    outputs: number[];
    biases: number[]; // Value above which the neural network will fire
    weights: number[][]; // How strong the connections are between each node

    constructor(inputCount: number, outputCount: number) {
        this.inputs = new Array(inputCount);
        this.outputs = new Array(outputCount);
        this.biases = new Array(outputCount);

        this.weights = [];
        for (let i = 0; i < inputCount; i++) {
            this.weights[i] = new Array(outputCount);
        }

        Level.#randomize(this);
    }

    static #randomize(level: Level): void {
        for (let i = 0; i < level.inputs.length; i++) {
            for (let j = 0; j < level.outputs.length; j++) {
                level.weights[i][j] = Math.random()*2-1;
            }
        }

        for (let i = 0; i < level.biases.length; i++) {
            level.biases[i] = Math.random()*2-1;
        }
    }

    static feedForward(givenInputs: number[], level: Level): number[] {
        for (let i = 0; i < level.inputs.length; i++) {
            level.inputs[i] = givenInputs[i];
        }

        for (let i = 0; i < level.outputs.length; i++) {
            let sum = 0;
            for (let j = 0; j < level.inputs.length; j++) {
                sum += level.inputs[j]*level.weights[j][i];
            }

            if (sum > level.biases[i]) {
                level.outputs[i] = 1;
            } else {
                level.outputs[i] = 0;
            }
        }

        return level.outputs;
    }
}
