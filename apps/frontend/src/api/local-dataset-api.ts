import { invoke } from "@tauri-apps/api/core";
import { DATASET_VERSION } from "@draftgap/core/src/models/dataset/Dataset";
import type { DataTier } from "@draftgap/core/src/models/dataset/DataTier";
import type { DatasetFetch } from "../../../dataset/src/fetch";
import type { ChampionData } from "@draftgap/core/src/models/dataset/ChampionData";
import type {
    DatasetCheckpointContext,
    DatasetCheckpointStore,
    DatasetGenerationName,
} from "../../../dataset/src/index";

type DatasetName = "current-patch" | "30-days";
const LOCAL_DATASET_CHECKPOINT_FORMAT_VERSION = 1;
const LOCAL_DATASET_CHECKPOINT_MAX_AGE_MS = 36 * 60 * 60 * 1000;

type DatasetHttpResponse = {
    status: number;
    body: string;
    retryAfter?: string;
};

type LocalDatasetCheckpointMetadata = {
    formatVersion: number;
    checkpointId: string;
    datasetVersion: string;
    tier: DataTier;
    name: DatasetGenerationName;
    queryVersion: string;
    riotVersion: string;
    createdAt: string;
};

type LocalDatasetCheckpoint = {
    metadata: string;
    champions: Array<{
        championKey: string;
        contents: string;
    }>;
};

export type LocalDatasetPair = {
    currentPatch: string;
    thirtyDays: string;
};

export async function tauriDatasetFetchWithTimeout(
    input: Parameters<DatasetFetch>[0],
    init?: Parameters<DatasetFetch>[1],
    timeoutMs?: number,
) {
    const method =
        init?.method ?? (input instanceof Request ? input.method : "GET");
    if (method.toUpperCase() !== "GET") {
        throw new Error("Local dataset fetch only supports GET requests");
    }

    const url =
        typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
    const response = await invoke<DatasetHttpResponse>("fetch_dataset_url", {
        url,
        timeoutMs,
    });

    return new Response(response.body, {
        status: response.status,
        headers: response.retryAfter
            ? { "Retry-After": response.retryAfter }
            : undefined,
    });
}

export const tauriDatasetFetch: DatasetFetch = (input, init) =>
    tauriDatasetFetchWithTimeout(input, init);

export async function loadLocalDataset(tier: DataTier, name: DatasetName) {
    return await invoke<string | null>("load_local_dataset", {
        datasetVersion: DATASET_VERSION,
        tier,
        name,
    });
}

export async function saveLocalDataset(
    tier: DataTier,
    name: DatasetName,
    contents: string,
) {
    await invoke("save_local_dataset", {
        datasetVersion: DATASET_VERSION,
        tier,
        name,
        contents,
    });
}

export async function loadLocalDatasetPair(tier: DataTier) {
    return await invoke<LocalDatasetPair | null>("load_local_dataset_pair", {
        datasetVersion: DATASET_VERSION,
        tier,
    });
}

export async function saveDownloadedLocalDatasetPair(
    tier: DataTier,
    currentPatch: string,
    thirtyDays: string,
) {
    await invoke("save_downloaded_local_dataset_pair", {
        datasetVersion: DATASET_VERSION,
        tier,
        pairId: crypto.randomUUID(),
        currentPatch,
        thirtyDays,
    });
}

async function loadLocalDatasetCheckpoint(
    tier: DataTier,
    name: DatasetGenerationName,
) {
    return await invoke<LocalDatasetCheckpoint | null>(
        "load_local_dataset_checkpoint",
        {
            datasetVersion: DATASET_VERSION,
            tier,
            name,
        },
    );
}

async function initializeLocalDatasetCheckpoint(
    metadata: LocalDatasetCheckpointMetadata,
) {
    await invoke("initialize_local_dataset_checkpoint", {
        datasetVersion: DATASET_VERSION,
        tier: metadata.tier,
        name: metadata.name,
        checkpointId: metadata.checkpointId,
        metadata: JSON.stringify(metadata),
    });
}

async function saveLocalDatasetCheckpointChampion(
    context: DatasetCheckpointContext,
    checkpointId: string,
    champion: ChampionData,
) {
    await invoke("save_local_dataset_checkpoint_champion", {
        datasetVersion: DATASET_VERSION,
        tier: context.tier,
        name: context.dataset,
        checkpointId,
        championKey: champion.key,
        contents: JSON.stringify(champion),
    });
}

function validCheckpointMetadata(
    metadata: LocalDatasetCheckpointMetadata,
    context: DatasetCheckpointContext,
) {
    const createdAt = new Date(metadata.createdAt).getTime();
    const age = Date.now() - createdAt;

    return (
        metadata.formatVersion === LOCAL_DATASET_CHECKPOINT_FORMAT_VERSION &&
        typeof metadata.checkpointId === "string" &&
        /^[a-zA-Z0-9_-]+$/.test(metadata.checkpointId) &&
        metadata.datasetVersion === DATASET_VERSION &&
        metadata.tier === context.tier &&
        metadata.name === context.dataset &&
        metadata.queryVersion === context.queryVersion &&
        metadata.riotVersion === context.riotVersion &&
        Number.isFinite(createdAt) &&
        age >= 0 &&
        age <= LOCAL_DATASET_CHECKPOINT_MAX_AGE_MS
    );
}

function isChampionData(
    value: unknown,
    expectedKey: string,
): value is ChampionData {
    if (!value || typeof value !== "object") return false;

    const isRecord = (candidate: unknown) =>
        candidate !== null &&
        typeof candidate === "object" &&
        !Array.isArray(candidate);

    const champion = value as Partial<ChampionData>;
    if (champion.key !== expectedKey || !isRecord(champion.statsByRole)) {
        return false;
    }

    return [0, 1, 2, 3, 4].every((role) => {
        const roleData = champion.statsByRole?.[role as 0 | 1 | 2 | 3 | 4];
        return (
            roleData !== undefined &&
            Number.isFinite(roleData.games) &&
            Number.isFinite(roleData.wins) &&
            isRecord(roleData.matchup) &&
            isRecord(roleData.synergy) &&
            isRecord(roleData.damageProfile) &&
            Array.isArray(roleData.statsByTime) &&
            roleData.statsByTime.every(
                (stats) =>
                    isRecord(stats) &&
                    Number.isFinite(stats.games) &&
                    Number.isFinite(stats.wins),
            )
        );
    });
}

export type LocalDatasetCheckpointStore = DatasetCheckpointStore & {
    commitPair: (currentPatch: string, thirtyDays: string) => Promise<void>;
    clear: () => Promise<void>;
};

export function createLocalDatasetCheckpointStore(): LocalDatasetCheckpointStore {
    const activeCheckpoints = new Map<
        DatasetGenerationName,
        { tier: DataTier; checkpointId: string }
    >();

    return {
        async prepare(context) {
            const stored = await loadLocalDatasetCheckpoint(
                context.tier,
                context.dataset,
            );
            if (stored) {
                try {
                    const metadata = JSON.parse(
                        stored.metadata,
                    ) as LocalDatasetCheckpointMetadata;
                    if (validCheckpointMetadata(metadata, context)) {
                        const championData: Record<string, ChampionData> = {};
                        for (const checkpoint of stored.champions) {
                            try {
                                const champion = JSON.parse(
                                    checkpoint.contents,
                                ) as unknown;
                                if (
                                    isChampionData(
                                        champion,
                                        checkpoint.championKey,
                                    )
                                ) {
                                    championData[champion.key] = champion;
                                }
                            } catch {
                                // A damaged single-champion checkpoint is
                                // fetched again without discarding the rest.
                            }
                        }

                        activeCheckpoints.set(context.dataset, {
                            tier: context.tier,
                            checkpointId: metadata.checkpointId,
                        });
                        return {
                            checkpointId: metadata.checkpointId,
                            createdAt: metadata.createdAt,
                            championData,
                        };
                    }
                } catch {
                    // Invalid metadata starts a clean checkpoint below.
                }
            }

            const metadata: LocalDatasetCheckpointMetadata = {
                formatVersion: LOCAL_DATASET_CHECKPOINT_FORMAT_VERSION,
                checkpointId: crypto.randomUUID(),
                datasetVersion: DATASET_VERSION,
                tier: context.tier,
                name: context.dataset,
                queryVersion: context.queryVersion,
                riotVersion: context.riotVersion,
                createdAt: new Date().toISOString(),
            };
            await initializeLocalDatasetCheckpoint(metadata);
            activeCheckpoints.set(context.dataset, {
                tier: context.tier,
                checkpointId: metadata.checkpointId,
            });
            return {
                checkpointId: metadata.checkpointId,
                createdAt: metadata.createdAt,
                championData: {},
            };
        },
        async saveChampion(context, checkpointId, champion) {
            await saveLocalDatasetCheckpointChampion(
                context,
                checkpointId,
                champion,
            );
        },
        async commitPair(currentPatch, thirtyDays) {
            const currentCheckpoint = activeCheckpoints.get("current-patch");
            const thirtyDaysCheckpoint = activeCheckpoints.get("30-days");
            if (
                !currentCheckpoint ||
                !thirtyDaysCheckpoint ||
                currentCheckpoint.tier !== thirtyDaysCheckpoint.tier
            ) {
                throw new Error("Local dataset checkpoints are incomplete");
            }

            await invoke("commit_local_dataset_pair", {
                datasetVersion: DATASET_VERSION,
                tier: currentCheckpoint.tier,
                pairId: crypto.randomUUID(),
                currentCheckpointId: currentCheckpoint.checkpointId,
                thirtyDaysCheckpointId: thirtyDaysCheckpoint.checkpointId,
                currentPatch,
                thirtyDays,
            });
        },
        async clear() {
            await Promise.all(
                Array.from(activeCheckpoints, ([name, checkpoint]) =>
                    invoke("clear_local_dataset_checkpoint", {
                        datasetVersion: DATASET_VERSION,
                        tier: checkpoint.tier,
                        name,
                        checkpointId: checkpoint.checkpointId,
                    }),
                ),
            );
        },
    };
}
