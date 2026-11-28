import { describe, expect, test } from "bun:test";
import type { ChampionData } from "../models/dataset/ChampionData";
import {
    defaultChampionRoleData,
    type ChampionRoleData,
} from "../models/dataset/ChampionRoleData";
import type { Dataset } from "../models/dataset/Dataset";
import { Role, ROLES } from "../models/Role";
import { getDirectMatchup } from "./direct-matchup";

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

describe("getDirectMatchup", () => {
    test("uses only the opponent assigned to the same role", () => {
        const champion = createChampion("candidate");
        champion.statsByRole[Role.Middle].matchup[Role.Middle]["enemy-mid"] = {
            championKey: "enemy-mid",
            wins: 230,
            games: 400,
        };
        champion.statsByRole[Role.Middle].matchup[Role.Top]["enemy-top"] = {
            championKey: "enemy-top",
            wins: 100,
            games: 100,
        };
        const dataset = createDataset([champion]);

        expect(
            getDirectMatchup(
                dataset,
                champion.key,
                Role.Middle,
                new Map([
                    [Role.Middle, "enemy-mid"],
                    [Role.Top, "enemy-top"],
                ]),
            ),
        ).toEqual({
            opponentChampionKey: "enemy-mid",
            winrate: 0.575,
            games: 400,
        });
    });

    test("returns nothing without an assigned same-role opponent or data", () => {
        const champion = createChampion("candidate");
        const dataset = createDataset([champion]);

        expect(
            getDirectMatchup(dataset, champion.key, Role.Middle, new Map()),
        ).toBeUndefined();
        expect(
            getDirectMatchup(
                dataset,
                champion.key,
                Role.Middle,
                new Map([[Role.Middle, "enemy-mid"]]),
            ),
        ).toBeUndefined();
    });
});
