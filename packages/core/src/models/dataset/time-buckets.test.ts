import { describe, expect, test } from "bun:test";
import type { ChampionData } from "./ChampionData";
import {
    defaultChampionRoleData,
    type ChampionRoleData,
} from "./ChampionRoleData";
import type { Dataset } from "./Dataset";
import { Role, ROLES } from "../Role";
import {
    adaptDatasetTimeBuckets,
    selectAdaptiveTimeBuckets,
} from "./time-buckets";

function createChampion(key: string): ChampionData {
    const statsByRole = Object.fromEntries(
        ROLES.map((role) => [role, defaultChampionRoleData()]),
    ) as Record<Role, ChampionRoleData>;

    return {
        id: key,
        key,
        name: key,
        i18n: {},
        statsByRole,
    };
}

function createDataset(champions: ChampionData[]): Dataset {
    return {
        version: "test",
        date: "2026-01-01",
        timeBuckets: [],
        championData: Object.fromEntries(
            champions.map((champion) => [champion.key, champion]),
        ),
        itemData: {},
        runeData: {},
        runePathData: {},
        statShardData: {},
        summonerSpellData: {},
    };
}

function ranges(buckets: ReturnType<typeof selectAdaptiveTimeBuckets>) {
    return buckets.map((bucket) => [
        bucket.sourceBucketStart,
        bucket.sourceBucketEnd,
    ]);
}

describe("selectAdaptiveTimeBuckets", () => {
    test("keeps every source bucket when each contains at least 8% of games", () => {
        const buckets = selectAdaptiveTimeBuckets([
            100, 100, 100, 100, 100, 100, 100,
        ]);

        expect(ranges(buckets)).toEqual([
            [0, 0],
            [1, 1],
            [2, 2],
            [3, 3],
            [4, 4],
            [5, 5],
            [6, 6],
        ]);
    });

    test("keeps an exact 8% bucket and merges one just below the threshold", () => {
        expect(
            ranges(
                selectAdaptiveTimeBuckets([80, 120, 200, 200, 200, 100, 100]),
            ),
        ).toHaveLength(7);
        expect(
            ranges(
                selectAdaptiveTimeBuckets([79, 121, 200, 200, 200, 100, 100]),
            ),
        ).toEqual([
            [0, 1],
            [2, 2],
            [3, 3],
            [4, 4],
            [5, 5],
            [6, 6],
        ]);
    });

    test("maximizes bucket count and then chooses the lowest share variance", () => {
        const buckets = selectAdaptiveTimeBuckets([7, 43, 7, 13, 10, 10, 10]);

        expect(ranges(buckets)).toEqual([
            [0, 1],
            [2, 3],
            [4, 4],
            [5, 5],
            [6, 6],
        ]);
        expect(buckets.map((bucket) => bucket.gameShare)).toEqual([
            0.5, 0.2, 0.1, 0.1, 0.1,
        ]);
    });

    test("merges the sparse tail in a faster game-duration distribution", () => {
        const buckets = selectAdaptiveTimeBuckets([4, 18, 30, 25, 14, 6, 3]);

        expect(ranges(buckets)).toEqual([
            [0, 1],
            [2, 2],
            [3, 3],
            [4, 4],
            [5, 6],
        ]);
    });

    test("keeps long-game buckets separate when both have enough samples", () => {
        const buckets = selectAdaptiveTimeBuckets([2, 8, 20, 25, 20, 15, 10]);

        expect(ranges(buckets)).toEqual([
            [0, 1],
            [2, 2],
            [3, 3],
            [4, 4],
            [5, 5],
            [6, 6],
        ]);
    });

    test("uses the fixed five-bucket fallback when there are no games", () => {
        const buckets = selectAdaptiveTimeBuckets([0, 0, 0, 0, 0, 0, 0]);

        expect(ranges(buckets)).toEqual([
            [0, 1],
            [2, 2],
            [3, 3],
            [4, 4],
            [5, 6],
        ]);
        expect(
            buckets.map(({ start, end, gameShare }) => ({
                start,
                end,
                gameShare,
            })),
        ).toEqual([
            { start: 0, end: 20, gameShare: 0 },
            { start: 20, end: 25, gameShare: 0 },
            { start: 25, end: 30, gameShare: 0 },
            { start: 30, end: 35, gameShare: 0 },
            { start: 35, end: null, gameShare: 0 },
        ]);
    });
});

describe("adaptDatasetTimeBuckets", () => {
    test("applies one partition to every role and merges raw wins and games", () => {
        const champion = createChampion("test-champion");
        champion.statsByRole[Role.Middle].statsByTime = [
            { wins: 1, games: 5 },
            { wins: 4, games: 5 },
            { wins: 8, games: 40 },
            { wins: 2, games: 5 },
            { wins: 3, games: 5 },
            { wins: 10, games: 20 },
            { wins: 11, games: 20 },
        ];
        const dataset = createDataset([champion]);

        adaptDatasetTimeBuckets(dataset);

        expect(ranges(dataset.timeBuckets)).toEqual([
            [0, 1],
            [2, 2],
            [3, 4],
            [5, 5],
            [6, 6],
        ]);
        expect(champion.statsByRole[Role.Middle].statsByTime).toEqual([
            { wins: 5, games: 10 },
            { wins: 8, games: 40 },
            { wins: 5, games: 10 },
            { wins: 10, games: 20 },
            { wins: 11, games: 20 },
        ]);
        expect(champion.statsByRole[Role.Top].statsByTime).toEqual(
            Array.from({ length: 5 }, () => ({ wins: 0, games: 0 })),
        );
    });

    test("rejects malformed source time stats instead of publishing nulls", () => {
        const champion = createChampion("test-champion");
        champion.statsByRole[Role.Middle].statsByTime[6] = {
            wins: Number.NaN,
            games: 100,
        };

        expect(() =>
            adaptDatasetTimeBuckets(createDataset([champion])),
        ).toThrow("Invalid source time bucket at index 6");
    });
});
