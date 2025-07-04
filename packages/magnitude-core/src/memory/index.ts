import { Action } from '@/actions/types';
import { AgentConnector } from '@/connectors';
import { 
    ModularMemoryContext, 
    // BamlThought, 
    // BamlTurn, 
    ConnectorInstructions 
} from '@/ai/baml_client';
import { Observation, ObservationOptions, ObservationSource, renderObservations } from './observation';
import { BamlRenderable, observableDataToContext } from './context';
import z from 'zod';
import EventEmitter from 'eventemitter3';
import { jsonToObservableData, MultiMediaJson, observableDataToJson } from './serde';

// export interface AgentMemoryEvents {
//     'thought': (thought: string) => void;
// }

export interface SerializedAgentMemory {
    instructions?: string;
    observations: {
        source: ObservationSource,
        timestamp: number,
        data: MultiMediaJson,
        options?: ObservationOptions,
    }[];
}

export interface AgentMemoryOptions {
    thoughtLimit?: number, // TTL for thoughts
}

export class AgentMemory {
    //public readonly events: EventEmitter<AgentMemoryEvents> = new EventEmitter();
    private options: Required<AgentMemoryOptions>;
    //private history: StoredHistoryEntry[] = [];

    // Custom instructions relating to this memory instance (e.g. agent-level and/or task-level instructions)
    public readonly instructions: string | null;

    private observations: Observation[] = [];
    //private tasks: { task: string, observations: Observation[] }[] = [];

    constructor(instructions?: string, options?: AgentMemoryOptions) {
        this.instructions = instructions ?? null;
        this.options = {
            thoughtLimit: options?.thoughtLimit ?? 20
        };
    }

    // get observations(): Observation[] {
    //     if (this.tasks.length === 0) {
            
    //     }
    //     return this.tasks.at(-1).observations
    // }

    // public newTask(task: string): void {
    //     // Mark start of task for a new isolated memory window
    // }

    public isEmpty(): boolean {
        return this.observations.length === 0;
    }

    public recordThought(content: string): void {
        this.observations.push(
            Observation.fromThought(content, { type: 'thought', limit: this.options.thoughtLimit })
        );
        //this.events.emit('thought', content);
    }

    public recordObservation(obs: Observation): void {
        this.observations.push(obs);
    }

    public getLastThoughtMessage(): string | null {
        for (let i = this.observations.length - 1; i >= 0; i--) {
            const obs = this.observations[i];
            // toString() is a little funky here, or the idea that thought might not just be text
            if (obs.source.startsWith('thought')) return obs.toString();
        }
        return null;
    }

    public async buildContext(activeConnectors: AgentConnector[]): Promise<ModularMemoryContext> {
        const content = await renderObservations(this.observations);

        // TODO: doesn't really make sense for memory to be responsible for current state and instruction render logic
        const connectorInstructions: ConnectorInstructions[] = [];

        for (const connector of activeConnectors) {
            if (connector.getInstructions) {
                const instructions = await connector.getInstructions();

                if (instructions) {
                    connectorInstructions.push({
                        connectorId: connector.id,
                        instructions: instructions
                    });
                }
            }
        }

        return {
            instructions: this.instructions,
            observationContent: content,
            connectorInstructions: connectorInstructions
        };
    }

    public async toJSON(): Promise<SerializedAgentMemory> {
        const observations = [];
        for (const observation of this.observations) {
            observations.push({
                source: observation.source,
                timestamp: observation.timestamp,
                data: await observableDataToJson(observation.data),
                options: observation.options,
            });
        }
        return {
            ...(this.instructions ? { instructions: this.instructions } : {}),
            observations: observations
        };
    }

    // TODO: turn into class static method / rework cons
    public async loadJSON(data: SerializedAgentMemory) {
        //jsonToObservableData(data);
        const observations = [];
        for (const observation of data.observations) {
            observations.push(new Observation(
                observation.source,
                await jsonToObservableData(observation.data),
                observation.options,
                observation.timestamp
            ));
            
        }
        // nvm
        //this.instructions = this.instructions;

        this.observations = observations;


        // return {
        //     ...(this.instructions ? { instructions: this.instructions } : {}),
        //     observations: observations
        // };
    }
}
