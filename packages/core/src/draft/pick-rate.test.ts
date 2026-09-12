import { describe, expect, test } from "bun:test";
import { ChampionData } from "../models/dataset/ChampionData";
import {
    ChampionRoleData,
    defaultChampionRoleData,
} from "../models/dataset/ChampionRoleData";
import { Dataset } from "../models/dataset/Dataset";
import { Role, ROLES } from "../models/Role";
import {
    getPickRateLevel,
    getPickRatePercentile,
    getRoleGameTotals,
    getRolePickRate,
    getRolePickRateDistributions,
    PickRateLevel,
} from "./pick-rate";

function createChampion(key: string, role: Role, games: number): ChampionData {
    const statsByRole = Object.fromEntries(
        ROLES.map((candidateRole) => {
            const stats = defaultChampionRoleData();
            if (candidateRole === role) stats.games = games;
            return [candidateRole, stats];
        }),
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

describe("role pick rate", () => {
    test("uses the champion's share of games in the suggested role", () => {
        const dataset = createDataset([
            createChampion("candidate", Role.Middle, 250),
            createChampion("other", Role.Middle, 750),
            createChampion("top", Role.Top, 400),
        ]);
        const totals = getRoleGameTotals(dataset);

        expect(totals.get(Role.Middle)).toBe(1000);
        expect(getRolePickRate(dataset, "candidate", Role.Middle, totals)).toBe(
            0.5,
        );
    });

    test("returns zero when a role has no games", () => {
        const dataset = createDataset([
            createChampion("candidate", Role.Middle, 250),
        ]);

        expect(getRolePickRate(dataset, "candidate", Role.Support)).toBe(0);
    });

    test("groups pick rates by their percentile within a role", () => {
        const distribution = [
            0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1,
        ];

        expect(getPickRatePercentile(0.1, distribution)).toBe(1);
        expect(getPickRatePercentile(0.09, distribution)).toBe(0.9);
        expect(getPickRateLevel(0.1, distribution)).toBe(
            PickRateLevel.VeryHigh,
        );
        expect(getPickRateLevel(0.09, distribution)).toBe(PickRateLevel.High);
        expect(getPickRateLevel(0.08, distribution)).toBe(PickRateLevel.High);
        expect(getPickRateLevel(0.07, distribution)).toBe(PickRateLevel.Medium);
        expect(getPickRateLevel(0.05, distribution)).toBe(PickRateLevel.Medium);
        expect(getPickRateLevel(0.04, distribution)).toBe(PickRateLevel.Low);
    });

    test("builds separate distributions from played champions in each role", () => {
        const dataset = createDataset([
            createChampion("middle-low", Role.Middle, 100),
            createChampion("middle-high", Role.Middle, 300),
            createChampion("support", Role.Support, 200),
        ]);
        const distributions = getRolePickRateDistributions(dataset);

        expect(distributions.get(Role.Middle)).toEqual([0.5, 1]);
        expect(distributions.get(Role.Support)).toEqual([1]);
        expect(distributions.get(Role.Top)).toEqual([]);
    });
});
