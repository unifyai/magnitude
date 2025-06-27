/**
 * Observations and declarations for what kind of data is "observable" - i.e. can be processed into BAML context or JSON.
 */
import { fnv1a32Hex } from '@/util';
import { BamlRenderable, observableDataToContext } from './context';
import { Image } from './image';
import { MultiMediaJson, observableDataToJson } from './serde';

// undefined in JSON is either removed if k/v or removed from array, not actually JSON-compatible technically
export type ObservableDataPrimitive = Image | string | number | boolean | null | undefined; // | Observation

export type ObservableDataArray = Array<ObservableData>;

export type ObservableDataObject = {
    [key: string]: ObservableData;
};

export type ObservableData = ObservableDataPrimitive | ObservableDataArray | ObservableDataObject;


export interface ObservationOptions {
    //timestamp?: // TOOD: impl but default to now
    type: string;
    limit?: number;
    dedupe?: boolean; // dedupe adjacent identical observations of the same type
}

// consider limiting media based on source - e.g. thought is only text
export type ObservationSource = `connector:${string}` | `action:taken:${string}` | `action:result:${string}` | `thought`;

export class Observation {
    public readonly source: ObservationSource;
    public readonly timestamp: number;
    public readonly data: ObservableData;
    public readonly options?: ObservationOptions;

    constructor(source: ObservationSource, data: ObservableData, options?: ObservationOptions, timestamp?: number) {
        this.source = source;
        this.data = data;
        this.timestamp = timestamp ?? Date.now();
        this.options = options;
    }

    static fromConnector(connectorId: string, data: ObservableData, options?: ObservationOptions): Observation {
        return new Observation(`connector:${connectorId}`, data, options);
    }

    static fromActionTaken(actionId: string, data: ObservableData, options?: ObservationOptions): Observation {
        return new Observation(`action:taken:${actionId}`, data, options);
    }

    static fromActionResult(actionId: string, data: ObservableData, options?: ObservationOptions): Observation {
        return new Observation(`action:result:${actionId}`, data, options);
    }

    static fromThought(data: ObservableData, options?: ObservationOptions): Observation {
        return new Observation(`thought`, data, options);
    }

    toString() {
        // will be pretty ugly usually
        return JSON.stringify(this.data);
    }

    async toJson(): Promise<MultiMediaJson> {
        return await observableDataToJson(this.data);
    }

    async toContext(): Promise<BamlRenderable[]> {
        return await observableDataToContext(this.data);
    }

    async hash(): Promise<string> {
        // build str of all text+img content
        const stringifiedContent = JSON.stringify(await this.toJson());
        return fnv1a32Hex(stringifiedContent);
    }

    async equals(obs: Observation): Promise<boolean> {
        // TODO: deep eq for both text and img content
        return (await this.hash()) == (await obs.hash());
    }
}

async function filterObservations(observations: Observation[]): Promise<Observation[]> {
    /**
     * (LLM)
     * Filters an array of Observations based on type-specific `dedupe` and `limit` options
     * specified in `obs.options`. For each type:
     * 1. If `dedupe` is true, removes older adjacent identical observations (checked via `obs.equals()`),
     *    keeping the last in such a sequence.
     * 2. If `limit` is set, keeps only the last N observations of that type.
     * Deduplication is applied before limiting for each type.
     * Untyped observations (no `obs.options.type`) are passed through unfiltered.
     * The function preserves the original relative order of the surviving observations.
     */
    const observationsByType = new Map<string, {
        obsList: Observation[];
        limit?: number;
        dedupe?: boolean;
    }>();

    const untypedObservations: Observation[] = [];

    for (const obs of observations) {
        if (obs.options && obs.options.type) {
            const type = obs.options.type;
            if (!observationsByType.has(type)) {
                observationsByType.set(type, {
                    obsList: [],
                    limit: obs.options.limit,
                    dedupe: obs.options.dedupe,
                });
            }
            observationsByType.get(type)!.obsList.push(obs);
        } else {
            untypedObservations.push(obs);
        }
    }

    for (const data of observationsByType.values()) {
        let currentTypedObservations = data.obsList;

        if (data.dedupe && currentTypedObservations.length > 1) {
            const dedupedList: Observation[] = [];
            dedupedList.unshift(currentTypedObservations[currentTypedObservations.length - 1]);

            for (let i = currentTypedObservations.length - 2; i >= 0; i--) {
                const currentObs = currentTypedObservations[i];
                const lastKeptObs = dedupedList[0];
                
                if (!(await currentObs.equals(lastKeptObs))) {
                    dedupedList.unshift(currentObs);
                }
            }
            currentTypedObservations = dedupedList;
        }

        if (data.limit !== undefined && data.limit >= 0) {
            if (data.limit === 0) {
                currentTypedObservations = [];
            } else {
                currentTypedObservations = currentTypedObservations.slice(-data.limit);
            }
        }
        data.obsList = currentTypedObservations;
    }

    const finalObservationsToRender: Observation[] = [];
    const survivorSets = new Map<string, Set<Observation>>();
    for (const [type, data] of observationsByType.entries()) {
        survivorSets.set(type, new Set(data.obsList));
    }

    for (const originalObs of observations) {
        if (originalObs.options && originalObs.options.type) {
            if (survivorSets.get(originalObs.options.type)?.has(originalObs)) {
                finalObservationsToRender.push(originalObs);
            }
        } else {
            finalObservationsToRender.push(originalObs);
        }
    }
    return finalObservationsToRender;
}


export async function renderObservations(observations: Observation[]): Promise<BamlRenderable[]> {
    /**
     * Refines observations (according to observation culling options) and converts to BAML-renderable content
     */
    const filteredObservations = await filterObservations(observations);

    let content: BamlRenderable[] = [];
    for (const obs of filteredObservations) {
        if (obs.source.startsWith('action:taken') || obs.source.startsWith('thought')) {
            content.push(`[${new Date(obs.timestamp).toTimeString().split(' ')[0]}]: `);
        }
        content = [...content, ...await obs.toContext(), "\n"];
    }

    return content;
}