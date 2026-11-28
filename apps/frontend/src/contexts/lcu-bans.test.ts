import { expect, test } from "bun:test";
import type { LolChampSelectChampSelectAction } from "../types/Lcu";
import { getLcuBanSlots } from "./lcu-bans";

function action(overrides: Partial<LolChampSelectChampSelectAction>) {
    return {
        actorCellId: 0,
        championId: 1,
        completed: true,
        id: 1,
        isAllyAction: true,
        isInProgress: false,
        pickTurn: 0,
        type: "ban",
        ...overrides,
    };
}

test("places revealed bans in the right team and player slots", () => {
    const session = {
        actions: [
            [
                action({ actorCellId: 2, championId: 5 }),
                action({ actorCellId: 5, isAllyAction: false, championId: 7 }),
                action({ actorCellId: 1, completed: false }),
                action({ actorCellId: 0, championId: -1 }),
                action({ actorCellId: 0, type: "pick" }),
            ],
        ],
        myTeam: [{ cellId: 1 }, { cellId: 0 }, { cellId: 2 }],
        theirTeam: [{ cellId: 5 }],
    };
    expect(getLcuBanSlots(session, true)).toEqual([
        undefined,
        undefined,
        "5",
        undefined,
        undefined,
    ]);
    expect(getLcuBanSlots(session, false)).toEqual([
        "7",
        undefined,
        undefined,
        undefined,
        undefined,
    ]);
});

test("uses the order of the side's ban actions for unknown players", () => {
    const session = {
        actions: [
            [
                action({ isAllyAction: false, completed: false }),
                action({ actorCellId: 5, isAllyAction: false, championId: 7 }),
            ],
        ],
        myTeam: [],
        theirTeam: [],
    };
    expect(getLcuBanSlots(session, false)).toEqual([
        undefined,
        "7",
        undefined,
        undefined,
        undefined,
    ]);
});
