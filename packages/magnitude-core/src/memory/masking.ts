import { Observation } from './observation';

export async function maskObservations(observations: Observation[], freezeMask?: boolean[]): Promise<boolean[]> {
    // If freezeMask provided, will guarantee that first freezeMask.length observations return the same mask provided in freezeMask
    // - for dedupe: adjacent types in frozen section should survive if unfrozen contains that type with an equivalent value, instead of keeping most recent 
    // - for limit: limit should only apply to unfrozen section and should ignore (not count) anything in frozen section
    /**
     * Returns a boolean mask indicating which observations should be visible,
     * based on type-specific `dedupe` and `limit` options specified in `obs.retention`.
     * 
     * For each type:
     * 1. If `dedupe` is true, marks older adjacent identical observations as false,
     *    keeping only the last in such a sequence.
     * 2. If `limit` is set, marks only the last N observations of that type as true.
     * 
     * Deduplication is applied before limiting for each type.
     * Untyped observations (no `obs.retention.type`) are always marked as true.
     * 
     * @returns A boolean array where true indicates the observation at that index should be visible
     */
    const mask = new Array(observations.length).fill(true);
    
    // Group observations by type, tracking their original indices
    const observationsByType = new Map<string, {
        indices: number[];
        obsList: Observation[];
        limit?: number;
        dedupe?: boolean;
    }>();

    observations.forEach((obs, index) => {
        if (obs.retention && obs.retention.type) {
            const type = obs.retention.type;
            if (!observationsByType.has(type)) {
                observationsByType.set(type, {
                    indices: [],
                    obsList: [],
                    limit: obs.retention.limit,
                    dedupe: obs.retention.dedupe,
                });
            }
            const typeData = observationsByType.get(type)!;
            typeData.indices.push(index);
            typeData.obsList.push(obs);
        }
        // Untyped observations remain true in mask (already initialized)
    });

    // Process each type
    for (const [type, data] of observationsByType.entries()) {
        let visibleIndices = [...data.indices];

        // Apply deduplication
        if (data.dedupe && data.obsList.length > 1) {
            const dedupedIndices: number[] = [];
            dedupedIndices.unshift(data.indices[data.indices.length - 1]);

            for (let i = data.indices.length - 2; i >= 0; i--) {
                const currentObs = data.obsList[i];
                const lastKeptIdx = dedupedIndices[0];
                const lastKeptObs = data.obsList[data.indices.indexOf(lastKeptIdx)];
                
                if (!(await currentObs.equals(lastKeptObs))) {
                    dedupedIndices.unshift(data.indices[i]);
                }
            }
            visibleIndices = dedupedIndices;
        }

        // Apply limit
        if (data.limit !== undefined && data.limit >= 0) {
            if (data.limit === 0) {
                visibleIndices = [];
            } else {
                visibleIndices = visibleIndices.slice(-data.limit);
            }
        }

        // Mark non-visible observations as false
        const visibleSet = new Set(visibleIndices);
        data.indices.forEach(idx => {
            if (!visibleSet.has(idx)) {
                mask[idx] = false;
            }
        });
    }

    return mask;
}

export function applyMask(observations: Observation[], mask: boolean[]): Observation[] {
    /**
     * Applies a boolean mask to an array of observations, returning only those
     * observations where the corresponding mask value is true.
     * 
     * @param observations - The array of observations to filter
     * @param mask - Boolean array where true indicates the observation should be included
     * @returns Filtered array containing only observations where mask[i] is true
     */
    if (observations.length !== mask.length) {
        throw new Error(`Mask length (${mask.length}) must match observations length (${observations.length})`);
    }
    
    return observations.filter((_, index) => mask[index]);
}