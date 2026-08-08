import { getChampionDataFromLolalytics } from "./lolalytics";
import {
    deleteDatasetMatchupSynergyData,
    type Dataset,
    removeRankBias,
} from "@draftgap/core/src/models/dataset/Dataset";
import type { ItemData } from "@draftgap/core/src/models/dataset/ItemData";
import type {
    RuneData,
    RunePathData,
} from "@draftgap/core/src/models/dataset/RuneData";
import {
    getVersions,
    getChampions,
    getRunes,
    getItems,
    type RiotRunePath,
    type RiotItem,
    type RiotChampion,
    getSummonerSpells,
    type RiotSummonerSpell,
} from "./riot";
import type { SummonerSpellData } from "@draftgap/core/src/models/dataset/SummonerSpellData";
import type { ChampionData } from "@draftgap/core/src/models/dataset/ChampionData";
import {
    DEFAULT_DATA_TIER,
    type DataTier,
} from "@draftgap/core/src/models/dataset/DataTier";

export const CHAMPION_GENERATION_CONCURRENCY = 8;
const MINIMUM_DATASET_COMPLETION_RATIO = 0.9;

type ChampionDataFetcher = typeof getChampionDataFromLolalytics;

// TODO: Move to Riot API if exists?
const STAT_SHARD_DATA = {
    5001: {
        id: 5001,
        key: "HealthScaling",
        name: "Health Scaling",
        positions: [
            { slot: 1, index: 2 },
            { slot: 2, index: 2 },
        ],
    },
    5005: {
        id: 5005,
        key: "AttackSpeed",
        name: "Attack Speed",
        positions: [{ slot: 0, index: 1 }],
    },
    5007: {
        id: 5007,
        key: "CDRScaling",
        name: "Ability Haste",
        positions: [{ slot: 0, index: 2 }],
    },
    5008: {
        id: 5008,
        key: "AdaptiveForce",
        name: "Adaptive Force",
        positions: [
            { slot: 0, index: 0 },
            { slot: 1, index: 0 },
        ],
    },
    5010: {
        id: 5011,
        key: "Flex",
        name: "Flex",
        positions: [{ slot: 1, index: 1 }],
    },
    5011: {
        id: 5011,
        key: "Health",
        name: "Health",
        positions: [{ slot: 2, index: 0 }],
    },
    5013: {
        id: 5013,
        key: "TenacityAndSlowResist",
        name: "Tenactiy and Slow Resist",
        positions: [{ slot: 2, index: 1 }],
    },
};

async function main() {
    const storageModulePath = "./storage/storage";
    const { storeDataset } = await import(/* @vite-ignore */ storageModulePath);
    const { currentPatch, thirtyDays } =
        await generateDatasets(DEFAULT_DATA_TIER);

    await storeDataset(currentPatch, { name: "current-patch" });
    await storeDataset(thirtyDays, { name: "30-days" });
}

export type DatasetGenerationProgress = {
    dataset: "current-patch" | "30-days";
    completedChampions: number;
    totalChampions: number;
};

export type DatasetGenerationName = DatasetGenerationProgress["dataset"];

export type DatasetCheckpointContext = {
    dataset: DatasetGenerationName;
    queryVersion: string;
    riotVersion: string;
    tier: DataTier;
};

export type DatasetCheckpointSnapshot = {
    checkpointId: string;
    createdAt: string;
    championData: Record<string, ChampionData>;
};

export type DatasetCheckpointStore = {
    prepare: (
        context: DatasetCheckpointContext,
    ) => Promise<DatasetCheckpointSnapshot>;
    saveChampion: (
        context: DatasetCheckpointContext,
        checkpointId: string,
        champion: ChampionData,
    ) => Promise<void>;
};

export type DatasetGenerationOptions = {
    onProgress?: (progress: DatasetGenerationProgress) => void;
    championConcurrency?: number;
    checkpointStore?: DatasetCheckpointStore;
};

export async function generateDatasets(
    tier: DataTier,
    options: DatasetGenerationOptions = {},
) {
    const currentVersion = (await getVersions())[0];
    console.log("Patch:", currentVersion);

    const [championsData, runes, items, summonerSpells, championsDataCn] =
        await Promise.all([
            getChampions(currentVersion),
            getRunes(currentVersion),
            getItems(currentVersion),
            getSummonerSpells(currentVersion),
            getChampions(currentVersion, "zh_CN"),
        ]);

    const champions = championsData.map((c) => ({
        ...c,
        i18n: {
            zh_CN: {
                name:
                    championsDataCn.find((c2) => c2.key === c.key)?.name ??
                    c.name,
            },
        },
    }));

    const generateDataset = async (
        dataset: DatasetGenerationName,
        queryVersion: string,
    ) => {
        const checkpointContext: DatasetCheckpointContext = {
            dataset,
            queryVersion,
            riotVersion: currentVersion,
            tier,
        };
        const checkpoint =
            await options.checkpointStore?.prepare(checkpointContext);

        return await getDataset(
            queryVersion,
            champions,
            runes,
            items,
            summonerSpells,
            tier,
            {
                onProgress: (completedChampions, totalChampions) =>
                    options.onProgress?.({
                        dataset,
                        completedChampions,
                        totalChampions,
                    }),
                championConcurrency: options.championConcurrency,
                initialChampionData: checkpoint?.championData,
                date: checkpoint?.createdAt,
                onChampionComplete: options.checkpointStore
                    ? (champion) =>
                          options.checkpointStore!.saveChampion(
                              checkpointContext,
                              checkpoint!.checkpointId,
                              champion,
                          )
                    : undefined,
            },
        );
    };

    const datasetCurrentPatch = await generateDataset(
        "current-patch",
        currentVersion,
    );
    const dataset30days = await generateDataset("30-days", "30");

    deleteDatasetMatchupSynergyData(datasetCurrentPatch);

    return {
        currentPatch: datasetCurrentPatch,
        thirtyDays: dataset30days,
    };
}

function riotRunesToRuneData(runes: RiotRunePath[]) {
    const data = {
        runeData: Object.fromEntries(
            runes
                .map((path) => {
                    return path.slots.map((slot, slotIndex) =>
                        slot.runes.map(
                            (r, i) =>
                                [
                                    r.id,
                                    {
                                        id: r.id,
                                        key: r.key,
                                        name: r.name,
                                        pathId: path.id,
                                        icon: r.icon,
                                        slot: slotIndex,
                                        index: i,
                                    } satisfies RuneData,
                                ] as const,
                        ),
                    );
                })
                .flat()
                .flat(),
        ),
        runePathData: Object.fromEntries(
            runes.map(
                (r) =>
                    [
                        r.id,
                        {
                            id: r.id,
                            key: r.key,
                            name: r.name,
                            icon: r.icon,
                        } satisfies RunePathData,
                    ] as const,
            ),
        ),
        statShardData: STAT_SHARD_DATA,
    } satisfies Pick<Dataset, "runeData" | "runePathData" | "statShardData">;

    return data;
}

function riotItemsToItemData(
    items: Record<string, RiotItem>,
): Record<number, ItemData> {
    return Object.fromEntries(
        Object.entries(items).map(
            ([id, item]) =>
                [
                    id,
                    {
                        id: parseInt(id),
                        name: item.name,
                        gold: item.gold.total,
                    },
                ] as const,
        ),
    );
}

function riotSummonerSpellsToSummonerSpellData(
    summonerSpells: Record<string, RiotSummonerSpell>,
): Record<string, SummonerSpellData> {
    return Object.fromEntries(
        Object.entries(summonerSpells).map(
            ([id, spell]) =>
                [
                    spell.key,
                    {
                        id,
                        key: +spell.key,
                        name: spell.name,
                    },
                ] as const,
        ),
    );
}

export type GetDatasetOptions = {
    onProgress?: (completedChampions: number, totalChampions: number) => void;
    championConcurrency?: number;
    fetchChampionData?: ChampionDataFetcher;
    initialChampionData?: Record<string, ChampionData>;
    onChampionComplete?: (champion: ChampionData) => Promise<void>;
    date?: string;
};

export async function getDataset(
    version: string,
    champions: RiotChampion[],
    runes: RiotRunePath[],
    items: Record<string, RiotItem>,
    summonerSpells: Record<string, RiotSummonerSpell>,
    tier: DataTier = DEFAULT_DATA_TIER,
    options: GetDatasetOptions = {},
) {
    console.log("Getting dataset for version", version);
    const dataset: Dataset = {
        version: version,
        date: options.date ?? new Date().toISOString(),
        championData: {},
        ...riotRunesToRuneData(runes),
        itemData: riotItemsToItemData(items),
        summonerSpellData:
            riotSummonerSpellsToSummonerSpellData(summonerSpells),
    };

    const championKeys = new Set(champions.map((champion) => champion.key));
    for (const [key, champion] of Object.entries(
        options.initialChampionData ?? {},
    )) {
        if (championKeys.has(key) && champion.key === key) {
            dataset.championData[key] = champion;
        }
    }

    const pendingChampions = champions.filter(
        (champion) => dataset.championData[champion.key] === undefined,
    );
    const fetchChampionData =
        options.fetchChampionData ?? getChampionDataFromLolalytics;
    const requestedConcurrency =
        options.championConcurrency ?? CHAMPION_GENERATION_CONCURRENCY;
    const championConcurrency = Math.max(1, Math.floor(requestedConcurrency));
    let completedChampions = champions.length - pendingChampions.length;
    let nextChampionIndex = 0;

    options.onProgress?.(completedChampions, champions.length);

    const worker = async () => {
        while (true) {
            const championIndex = nextChampionIndex++;
            const champion = pendingChampions[championIndex];
            if (!champion) return;

            const [[, championData]] = await getChampionDataBatch(
                version,
                [champion],
                tier,
                fetchChampionData,
            );

            if (!championData) {
                console.log(
                    `Skipping champion ${champion.name} as Lolalytics has no data for it`,
                );
            } else {
                await options.onChampionComplete?.(championData);
                dataset.championData[championData.key] = championData;
            }

            completedChampions++;
            options.onProgress?.(completedChampions, champions.length);
        }
    };

    const workerResults = await Promise.allSettled(
        Array.from({
            length: Math.min(championConcurrency, pendingChampions.length),
        }).map(worker),
    );
    const failedWorker = workerResults.find(
        (result) => result.status === "rejected",
    );
    if (failedWorker?.status === "rejected") throw failedWorker.reason;

    const completedChampionCount = Object.keys(dataset.championData).length;
    const minimumChampionCount = Math.ceil(
        champions.length * MINIMUM_DATASET_COMPLETION_RATIO,
    );
    if (completedChampionCount < minimumChampionCount) {
        throw new Error(
            `Dataset generation only completed ${completedChampionCount} of ${champions.length} champions`,
        );
    }

    removeRankBias(dataset);

    return dataset;
}

export async function getChampionDataBatch(
    version: string,
    champions: RiotChampion[],
    tier: DataTier,
    fetchChampionData: ChampionDataFetcher = getChampionDataFromLolalytics,
) {
    return await Promise.all(
        champions.map(
            async (champion) =>
                [
                    champion,
                    await fetchChampionData(version, champion, tier),
                ] as const,
        ),
    );
}

if (
    (globalThis as any).Bun !== undefined &&
    (import.meta as ImportMeta & { main?: boolean }).main
) {
    void main();
}
