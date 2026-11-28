import type { LolChampSelectChampSelectSession } from "../types/Lcu";

type BanSession = Pick<LolChampSelectChampSelectSession, "actions"> & {
    myTeam: { cellId: number }[];
    theirTeam: { cellId: number }[];
};

export function getLcuBanSlots(session: BanSession, ally: boolean) {
    const players = ally ? session.myTeam : session.theirTeam;
    const slots = Array<string | undefined>(5).fill(undefined);
    const actions = session.actions
        .flat()
        .filter(
            (action) => action.type === "ban" && action.isAllyAction === ally,
        );
    actions.forEach((action, actionIndex) => {
        if (!action.completed || action.championId <= 0) return;
        const playerIndex = players.findIndex(
            (player) => player.cellId === action.actorCellId,
        );
        const index = playerIndex === -1 ? actionIndex : playerIndex;
        if (index < slots.length) slots[index] = String(action.championId);
    });
    return slots;
}
