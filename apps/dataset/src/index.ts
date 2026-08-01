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
import {
    DEFAULT_DATA_TIER,
    type DataTier,
} from "@draftgap/core/src/models/dataset/DataTier";

const BATCH_SIZE = 10;
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

export async function generateDatasets(
    tier: DataTier,
    onProgress?: (progress: DatasetGenerationProgress) => void,
    batchSize = BATCH_SIZE,
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

    const datasetCurrentPatch = await getDataset(
        currentVersion,
        champions,
        runes,
        items,
        summonerSpells,
        tier,
        (completedChampions, totalChampions) =>
            onProgress?.({
                dataset: "current-patch",
                completedChampions,
                totalChampions,
            }),
        batchSize,
    );
    const dataset30days = await getDataset(
        "30",
        champions,
        runes,
        items,
        summonerSpells,
        tier,
        (completedChampions, totalChampions) =>
            onProgress?.({
                dataset: "30-days",
                completedChampions,
                totalChampions,
            }),
        batchSize,
    );

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

export async function getDataset(
    version: string,
    champions: RiotChampion[],
    runes: RiotRunePath[],
    items: Record<string, RiotItem>,
    summonerSpells: Record<string, RiotSummonerSpell>,
    tier: DataTier = DEFAULT_DATA_TIER,
    onProgress?: (completedChampions: number, totalChampions: number) => void,
    batchSize = BATCH_SIZE,
    fetchChampionData: ChampionDataFetcher = getChampionDataFromLolalytics,
) {
    console.log("Getting dataset for version", version);
    const dataset: Dataset = {
        version: version,
        date: new Date().toISOString(),
        championData: {},
        ...riotRunesToRuneData(runes),
        itemData: riotItemsToItemData(items),
        summonerSpellData:
            riotSummonerSpellsToSummonerSpellData(summonerSpells),
    };

    for (let i = 0; i < champions.length; i += batchSize) {
        console.log(
            `Processing batch ${i / batchSize} of ${Math.ceil(
                champions.length / batchSize,
            )}`,
        );
        const batch = champions.slice(i, i + batchSize);
        const championData = await getChampionDataBatch(
            version,
            batch,
            tier,
            fetchChampionData,
        );

        for (const [c, champion] of championData) {
            if (!champion) {
                console.log(
                    "Skipping champion " +
                        c.name +
                        " as it lolalytics has no data for it",
                );
                continue;
            }

            dataset.championData[champion.key] = champion;
        }

        onProgress?.(
            Math.min(i + batch.length, champions.length),
            champions.length,
        );
    }

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
        champions.map(async (champion) => {
            try {
                return [
                    champion,
                    await fetchChampionData(version, champion, tier),
                ] as const;
            } catch (error) {
                console.error(
                    `Skipping champion ${champion.id} after its data request failed`,
                    error,
                );
                return [champion, undefined] as const;
            }
        }),
    );
}

if (
    (globalThis as any).Bun !== undefined &&
    (import.meta as ImportMeta & { main?: boolean }).main
) {
    void main();
}
