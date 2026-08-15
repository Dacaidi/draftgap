import { describe, expect, test } from "bun:test";
import { ChampionData } from "../models/dataset/ChampionData";
import {
    ChampionRoleData,
    defaultChampionRoleData,
} from "../models/dataset/ChampionRoleData";
import { Dataset } from "../models/dataset/Dataset";
import { Role, ROLES } from "../models/Role";
import { getBanSuggestions } from "./ban-suggestions";

function createChampion(
    key: string,
    role: Role,
    wins = 500,
    games = 1000,
): ChampionData {
    const statsByRole = Object.fromEntries(
        ROLES.map((candidateRole) => {
            const stats = defaultChampionRoleData();
            if (candidateRole === role) {
                stats.wins = wins;
                stats.games = games;
            }
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

describe("getBanSuggestions", () => {
    test("returns no suggestions until an allied intent is known", () => {
        const dataset = createDataset([
            createChampion("candidate", Role.Middle),
        ]);

        expect(
            getBanSuggestions(dataset, dataset, new Map(), new Map(), [], {
                ignoreChampionWinrates: true,
                riskLevel: "medium",
                minGames: 1,
            }),
        ).toEqual([]);
    });

    test("ranks counters once per champion and removes completed bans", () => {
        const ally = createChampion("ally", Role.Top);
        const counter = createChampion("counter", Role.Middle);
        const neutral = createChampion("neutral", Role.Jungle);

        counter.statsByRole[Role.Middle].matchup[Role.Top][ally.key] = {
            championKey: ally.key,
            wins: 700,
            games: 1000,
        };
        ally.statsByRole[Role.Top].matchup[Role.Middle][counter.key] = {
            championKey: counter.key,
            wins: 300,
            games: 1000,
        };

        const dataset = createDataset([ally, counter, neutral]);
        const config = {
            ignoreChampionWinrates: true,
            riskLevel: "medium" as const,
            minGames: 1,
        };

        const suggestions = getBanSuggestions(
            dataset,
            dataset,
            new Map([[Role.Top, ally.key]]),
            new Map(),
            [],
            config,
        );

        expect(suggestions[0]?.championKey).toBe(counter.key);
        expect(
            suggestions.filter(
                (suggestion) => suggestion.championKey === counter.key,
            ),
        ).toHaveLength(1);

        const suggestionsAfterBan = getBanSuggestions(
            dataset,
            dataset,
            new Map([[Role.Top, ally.key]]),
            new Map(),
            [counter.key],
            config,
        );

        expect(
            suggestionsAfterBan.some(
                (suggestion) => suggestion.championKey === counter.key,
            ),
        ).toBe(false);
    });
});
