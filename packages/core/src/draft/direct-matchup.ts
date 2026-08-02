import type { Dataset } from "../models/dataset/Dataset";
import type { Role } from "../models/Role";
import { getStats } from "./utils";

export type DirectMatchup = {
    opponentChampionKey: string;
    winrate: number;
    games: number;
};

export function getDirectMatchup(
    dataset: Dataset,
    championKey: string,
    role: Role,
    opposingTeam: ReadonlyMap<Role, string>,
): DirectMatchup | undefined {
    const opponentChampionKey = opposingTeam.get(role);
    if (!opponentChampionKey) return undefined;

    const stats = getStats(
        dataset,
        championKey,
        role,
        "matchup",
        role,
        opponentChampionKey,
    );
    if (stats.games === 0) return undefined;

    return {
        opponentChampionKey,
        winrate: stats.wins / stats.games,
        games: stats.games,
    };
}
