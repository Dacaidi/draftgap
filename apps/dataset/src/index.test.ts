import { describe, expect, spyOn, test } from "bun:test";
import {
    type ChampionRoleData,
    defaultChampionRoleData,
} from "@draftgap/core/src/models/dataset/ChampionRoleData";
import { Role, ROLES } from "@draftgap/core/src/models/Role";
import type { RiotChampion } from "./riot";
import { getChampionDataBatch } from "./index";

function createChampion(id: string, key: string): RiotChampion {
    return {
        id,
        key,
        name: id,
        i18n: {},
    };
}

describe("getChampionDataBatch", () => {
    test("keeps processing when one champion request fails", async () => {
        const consoleError = spyOn(console, "error").mockImplementation(
            () => {},
        );
        const champions = [
            createChampion("Ahri", "103"),
            createChampion("Broken", "99999"),
            createChampion("Ivern", "427"),
        ];

        try {
            const results = await getChampionDataBatch(
                "16.15.1",
                champions,
                "gold_plus",
                async (_version, champion) => {
                    if (champion.id === "Broken") {
                        throw new Error("No upstream data");
                    }

                    return {
                        ...champion,
                        statsByRole: Object.fromEntries(
                            ROLES.map((role) => [
                                role,
                                defaultChampionRoleData(),
                            ]),
                        ) as Record<Role, ChampionRoleData>,
                    };
                },
            );

            expect(results.map(([champion]) => champion.id)).toEqual([
                "Ahri",
                "Broken",
                "Ivern",
            ]);
            expect(results[0]?.[1]?.key).toBe("103");
            expect(results[1]?.[1]).toBeUndefined();
            expect(results[2]?.[1]?.key).toBe("427");
            expect(consoleError).toHaveBeenCalledTimes(1);
        } finally {
            consoleError.mockRestore();
        }
    });
});
