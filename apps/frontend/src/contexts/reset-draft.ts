import type { Team } from "@draftgap/core/src/models/Team";

export function resetTeamsAndSelectAlly(
    resetTeam: (team: Team) => void,
    select: (team: Team, index: number) => void,
) {
    resetTeam("ally");
    resetTeam("opponent");
    select("ally", 0);
}
