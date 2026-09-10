import { Dataset } from "../models/dataset/Dataset";
import { Role } from "../models/Role";
import { AnalyzeDraftConfig } from "./analysis";
import { getSuggestions, Suggestion } from "./suggestions";
import { getStats } from "./utils";
import { getRoleGameTotals, getRolePickRate } from "./pick-rate";

export interface BanSuggestion extends Suggestion {
    games: number;
    pickRate: number;
}

export function getBanSuggestions(
    dataset: Dataset,
    synergyMatchupDataset: Dataset,
    allyTeam: Map<Role, string>,
    opponentTeam: Map<Role, string>,
    bannedChampions: Iterable<string>,
    config: AnalyzeDraftConfig,
) {
    if (allyTeam.size === 0) return [];

    const banned = new Set(bannedChampions);
    const bestSuggestionByChampion = new Map<string, BanSuggestion>();
    const roleGameTotals = getRoleGameTotals(synergyMatchupDataset);

    const suggestions = getSuggestions(
        dataset,
        synergyMatchupDataset,
        new Map(opponentTeam),
        new Map(allyTeam),
        config,
    );

    for (const suggestion of suggestions) {
        if (banned.has(suggestion.championKey)) continue;

        const games = getStats(
            synergyMatchupDataset,
            suggestion.championKey,
            suggestion.role,
        ).games;
        const existing = bestSuggestionByChampion.get(suggestion.championKey);

        if (
            existing &&
            existing.draftResult.winrate >= suggestion.draftResult.winrate
        ) {
            continue;
        }

        bestSuggestionByChampion.set(suggestion.championKey, {
            ...suggestion,
            games,
            pickRate: getRolePickRate(
                synergyMatchupDataset,
                suggestion.championKey,
                suggestion.role,
                roleGameTotals,
            ),
        });
    }

    return [...bestSuggestionByChampion.values()].sort(
        (a, b) =>
            b.draftResult.winrate - a.draftResult.winrate || b.games - a.games,
    );
}
