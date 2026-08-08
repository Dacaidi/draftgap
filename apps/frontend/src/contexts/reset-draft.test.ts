/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import type { Team } from "@draftgap/core/src/models/Team";
import { resetTeamsAndSelectAlly } from "./reset-draft";

describe("resetTeamsAndSelectAlly", () => {
    test("returns to the ally table after resetting both teams", () => {
        const calls: string[] = [];
        let selectedTeam: Team | undefined;

        resetTeamsAndSelectAlly(
            (team) => {
                calls.push(`reset:${team}`);
                selectedTeam = team;
            },
            (team, index) => {
                calls.push(`select:${team}:${index}`);
                selectedTeam = team;
            },
        );

        expect(calls).toEqual([
            "reset:ally",
            "reset:opponent",
            "select:ally:0",
        ]);
        expect(selectedTeam).toBe("ally");
    });
});
