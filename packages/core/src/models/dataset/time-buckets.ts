import type { ChampionTimeStats } from "./ChampionRoleData";
import type { Dataset } from "./Dataset";

export const MIN_TIME_BUCKET_GAME_SHARE = 0.08;

export const SOURCE_TIME_BUCKETS = [
    { start: 0, end: 15 },
    { start: 15, end: 20 },
    { start: 20, end: 25 },
    { start: 25, end: 30 },
    { start: 30, end: 35 },
    { start: 35, end: 40 },
    { start: 40, end: null },
] as const;

export type DatasetTimeBucket = {
    start: number;
    end: number | null;
    gameShare: number;
    sourceBucketStart: number;
    sourceBucketEnd: number;
};

type SourceBucketGroup = {
    start: number;
    end: number;
};

const FALLBACK_SOURCE_BUCKET_GROUPS: readonly SourceBucketGroup[] = [
    { start: 0, end: 1 },
    { start: 2, end: 2 },
    { start: 3, end: 3 },
    { start: 4, end: 4 },
    { start: 5, end: 6 },
];

function normalizeSourceGames(sourceGames: readonly number[]) {
    return SOURCE_TIME_BUCKETS.map((_, index) => {
        const games = sourceGames[index] ?? 0;
        return Number.isFinite(games) && games > 0 ? games : 0;
    });
}

function groupsFromCutMask(mask: number) {
    const groups: SourceBucketGroup[] = [];
    let start = 0;

    for (
        let sourceBucket = 0;
        sourceBucket < SOURCE_TIME_BUCKETS.length - 1;
        sourceBucket++
    ) {
        if ((mask & (1 << sourceBucket)) !== 0) {
            groups.push({ start, end: sourceBucket });
            start = sourceBucket + 1;
        }
    }

    groups.push({ start, end: SOURCE_TIME_BUCKETS.length - 1 });
    return groups;
}

function sumGroupGames(
    sourceGames: readonly number[],
    group: SourceBucketGroup,
) {
    let games = 0;
    for (let index = group.start; index <= group.end; index++) {
        games += sourceGames[index] ?? 0;
    }
    return games;
}

function shareVariance(shares: readonly number[]) {
    const mean = 1 / shares.length;
    return (
        shares.reduce((sum, share) => sum + (share - mean) ** 2, 0) /
        shares.length
    );
}

function toDatasetTimeBuckets(
    groups: readonly SourceBucketGroup[],
    sourceGames: readonly number[],
    totalGames: number,
) {
    return groups.map((group) => ({
        start: SOURCE_TIME_BUCKETS[group.start]!.start,
        end: SOURCE_TIME_BUCKETS[group.end]!.end,
        gameShare:
            totalGames === 0
                ? 0
                : sumGroupGames(sourceGames, group) / totalGames,
        sourceBucketStart: group.start,
        sourceBucketEnd: group.end,
    }));
}

/**
 * Selects a common set of contiguous time buckets for the whole dataset.
 * More buckets are preferred; equally sized partitions are ranked by how
 * evenly they divide the games.
 */
export function selectAdaptiveTimeBuckets(
    sourceGamesInput: readonly number[],
): DatasetTimeBucket[] {
    const sourceGames = normalizeSourceGames(sourceGamesInput);
    const totalGames = sourceGames.reduce((sum, games) => sum + games, 0);

    if (totalGames === 0) {
        return toDatasetTimeBuckets(
            FALLBACK_SOURCE_BUCKET_GROUPS,
            sourceGames,
            totalGames,
        );
    }

    let bestGroups: SourceBucketGroup[] | undefined;
    let bestVariance = Number.POSITIVE_INFINITY;
    const cutMaskCount = 1 << (SOURCE_TIME_BUCKETS.length - 1);

    for (let mask = 0; mask < cutMaskCount; mask++) {
        const groups = groupsFromCutMask(mask);
        const shares = groups.map(
            (group) => sumGroupGames(sourceGames, group) / totalGames,
        );

        if (
            shares.some(
                (share) => share + Number.EPSILON < MIN_TIME_BUCKET_GAME_SHARE,
            )
        ) {
            continue;
        }

        const variance = shareVariance(shares);
        if (
            !bestGroups ||
            groups.length > bestGroups.length ||
            (groups.length === bestGroups.length &&
                variance < bestVariance - Number.EPSILON)
        ) {
            bestGroups = groups;
            bestVariance = variance;
        }
    }

    return toDatasetTimeBuckets(bestGroups!, sourceGames, totalGames);
}

export function getDatasetSourceTimeBucketGames(dataset: Dataset) {
    const sourceGames = Array.from(
        { length: SOURCE_TIME_BUCKETS.length },
        () => 0,
    );

    for (const champion of Object.values(dataset.championData)) {
        for (const role of Object.values(champion.statsByRole)) {
            if (role.statsByTime.length !== SOURCE_TIME_BUCKETS.length) {
                throw new Error(
                    `Expected ${SOURCE_TIME_BUCKETS.length} source time buckets, received ${role.statsByTime.length}`,
                );
            }

            for (let index = 0; index < SOURCE_TIME_BUCKETS.length; index++) {
                const stats = role.statsByTime[index]!;
                if (
                    !Number.isFinite(stats.games) ||
                    !Number.isFinite(stats.wins) ||
                    stats.games < 0 ||
                    stats.wins < 0 ||
                    stats.wins > stats.games
                ) {
                    throw new Error(
                        `Invalid source time bucket at index ${index}`,
                    );
                }

                sourceGames[index]! += stats.games;
            }
        }
    }

    return sourceGames;
}

function mergeTimeStats(
    sourceStats: readonly ChampionTimeStats[],
    bucket: DatasetTimeBucket,
) {
    const merged: ChampionTimeStats = { wins: 0, games: 0 };

    for (
        let index = bucket.sourceBucketStart;
        index <= bucket.sourceBucketEnd;
        index++
    ) {
        merged.wins += sourceStats[index]!.wins;
        merged.games += sourceStats[index]!.games;
    }

    return merged;
}

/**
 * Replaces every role's seven raw time buckets with a dataset-wide adaptive
 * partition. Call this before removeRankBias so wins and games are merged raw.
 */
export function adaptDatasetTimeBuckets(dataset: Dataset) {
    const sourceGames = getDatasetSourceTimeBucketGames(dataset);
    const timeBuckets = selectAdaptiveTimeBuckets(sourceGames);

    for (const champion of Object.values(dataset.championData)) {
        for (const role of Object.values(champion.statsByRole)) {
            role.statsByTime = timeBuckets.map((bucket) =>
                mergeTimeStats(role.statsByTime, bucket),
            );
        }
    }

    dataset.timeBuckets = timeBuckets;
}
