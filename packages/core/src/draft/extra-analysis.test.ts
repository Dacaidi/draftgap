import { describe, expect, test } from "bun:test";
import type { ChampionData } from "../models/dataset/ChampionData";
import { defaultChampionRoleData } from "../models/dataset/ChampionRoleData";
import type { Dataset } from "../models/dataset/Dataset";
import { analyzeDraftExtra } from "./extra-analysis";

function createDataset(
    timeBucketCount: number,
    championTimeBucketCount = timeBucketCount,
): Dataset {
    const roleData = defaultChampionRoleData();
    roleData.games = 10_000;
    roleData.wins = 5_200;
    roleData.statsByTime = Array.from(
        { length: championTimeBucketCount },
        (_, index) => ({
            games: 1_000,
            wins: 500 + index * 10,
        }),
    );

    return {
        version: "test",
        date: "2026-08-15",
        championData: {
            "103": {
                id: "Ahri",
                key: "103",
                name: "Ahri",
                i18n: {},
                statsByRole: {
                    2: roleData,
                } as ChampionData["statsByRole"],
            },
        },
        itemData: {},
        runeData: {},
        runePathData: {},
        statShardData: {},
        summonerSpellData: {},
        timeBuckets: Array.from({ length: timeBucketCount }, (_, index) => ({
            start: index * 5,
            end: index === timeBucketCount - 1 ? null : (index + 1) * 5,
            gameShare: 1 / timeBucketCount,
            sourceBucketStart: index,
            sourceBucketEnd: index,
        })),
    };
}

describe("analyzeDraftExtra", () => {
    test("uses the dataset's adaptive time buckets", () => {
        const fullDataset = createDataset(6);
        const result = analyzeDraftExtra(
            fullDataset,
            fullDataset,
            new Map([[2 as const, "103"]]),
            new Map(),
            {
                ignoreChampionWinrates: false,
                minGames: 0,
                riskLevel: "medium",
            },
        );

        expect(result.timeBuckets).toEqual(fullDataset.timeBuckets);
        expect(result.ratingByTime).toHaveLength(6);
        expect(result.ratingByTime[0].championResults[0]).toMatchObject({
            championKey: "103",
            role: 2,
        });
    });

    test("handles a missing champion time bucket defensively", () => {
        const fullDataset = createDataset(4, 3);
        const result = analyzeDraftExtra(
            fullDataset,
            fullDataset,
            new Map([[2 as const, "103"]]),
            new Map(),
            {
                ignoreChampionWinrates: false,
                minGames: 0,
                riskLevel: "medium",
            },
        );

        expect(result.ratingByTime).toHaveLength(4);
        expect(result.ratingByTime[3].totalRating).toBeCloseTo(0);
        expect(Number.isFinite(result.ratingByTime[3].totalRating)).toBe(true);
    });
});
