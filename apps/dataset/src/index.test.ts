import { describe, expect, test } from "bun:test";
import {
    type ChampionRoleData,
    defaultChampionRoleData,
} from "@draftgap/core/src/models/dataset/ChampionRoleData";
import { Role, ROLES } from "@draftgap/core/src/models/Role";
import type { RiotChampion } from "./riot";
import type { ChampionData } from "@draftgap/core/src/models/dataset/ChampionData";
import { getChampionDataBatch, getDataset } from "./index";

function createChampion(id: string, key: string): RiotChampion {
    return {
        id,
        key,
        name: id,
        i18n: {},
    };
}

function createChampionData(champion: RiotChampion): ChampionData {
    const statsByRole = Object.fromEntries(
        ROLES.map((role) => [role, defaultChampionRoleData()]),
    ) as Record<Role, ChampionRoleData>;
    statsByRole[Role.Middle].games = 100;
    statsByRole[Role.Middle].wins = 50;

    return {
        ...champion,
        statsByRole,
    };
}

describe("getChampionDataBatch", () => {
    test("propagates transient champion request failures", async () => {
        const champions = [
            createChampion("Ahri", "103"),
            createChampion("Broken", "99999"),
            createChampion("Ivern", "427"),
        ];

        await expect(
            getChampionDataBatch(
                "16.15.1",
                champions,
                "gold_plus",
                async (_version, champion) => {
                    if (champion.id === "Broken") {
                        throw new Error("No upstream data");
                    }

                    return {
                        ...createChampionData(champion),
                    };
                },
            ),
        ).rejects.toThrow("No upstream data");
    });

    test("keeps explicit no-data results", async () => {
        const champion = createChampion("Missing", "99999");
        const results = await getChampionDataBatch(
            "16.15.1",
            [champion],
            "gold_plus",
            async () => undefined,
        );

        expect(results).toEqual([[champion, undefined]]);
    });
});

describe("getDataset", () => {
    test("resumes checkpoints and reports progress after each champion", async () => {
        const champions = [
            createChampion("Ahri", "103"),
            createChampion("Ivern", "427"),
            createChampion("Zed", "238"),
        ];
        const fetched: string[] = [];
        const saved: string[] = [];
        const progress: Array<[number, number]> = [];

        const dataset = await getDataset(
            "16.15.1",
            champions,
            [],
            {},
            {},
            "gold_plus",
            {
                championConcurrency: 2,
                initialChampionData: {
                    "103": createChampionData(champions[0]!),
                },
                fetchChampionData: async (_version, champion) => {
                    fetched.push(champion.key);
                    return createChampionData(champion);
                },
                onChampionComplete: async (champion) => {
                    saved.push(champion.key);
                },
                onProgress: (completed, total) => {
                    progress.push([completed, total]);
                },
            },
        );

        expect(fetched.sort()).toEqual(["238", "427"]);
        expect(saved.sort()).toEqual(["238", "427"]);
        expect(progress[0]).toEqual([1, 3]);
        expect(progress.at(-1)).toEqual([3, 3]);
        expect(progress).toHaveLength(3);
        expect(Object.keys(dataset.championData).sort()).toEqual([
            "103",
            "238",
            "427",
        ]);
    });

    test("uses a worker pool instead of waiting at batch boundaries", async () => {
        const champions = [
            createChampion("A", "1"),
            createChampion("B", "2"),
            createChampion("C", "3"),
            createChampion("D", "4"),
        ];
        const started: string[] = [];
        let resolveA: (() => void) | undefined;
        let resolveB: (() => void) | undefined;

        const dataset = getDataset(
            "16.15.1",
            champions,
            [],
            {},
            {},
            "gold_plus",
            {
                championConcurrency: 2,
                fetchChampionData: async (_version, champion) => {
                    started.push(champion.id);
                    if (champion.id === "A") {
                        await new Promise<void>((resolve) => {
                            resolveA = resolve;
                        });
                    }
                    if (champion.id === "B") {
                        await new Promise<void>((resolve) => {
                            resolveB = resolve;
                        });
                    }
                    return createChampionData(champion);
                },
            },
        );

        await Promise.resolve();
        await Promise.resolve();
        expect(started).toEqual(["A", "B"]);

        resolveA?.();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(started).toContain("C");
        expect(resolveB).toBeDefined();

        resolveB?.();
        await dataset;
    });

    test("preserves successful checkpoints when another worker fails", async () => {
        const champions = [
            createChampion("A", "1"),
            createChampion("Broken", "2"),
            createChampion("C", "3"),
        ];
        const saved: string[] = [];
        const progress: number[] = [];

        await expect(
            getDataset("16.15.1", champions, [], {}, {}, "gold_plus", {
                championConcurrency: 2,
                fetchChampionData: async (_version, champion) => {
                    if (champion.id === "Broken") {
                        throw new Error("Temporary upstream failure");
                    }
                    return createChampionData(champion);
                },
                onChampionComplete: async (champion) => {
                    saved.push(champion.key);
                },
                onProgress: (completed) => progress.push(completed),
            }),
        ).rejects.toThrow("Temporary upstream failure");

        expect(saved.sort()).toEqual(["1", "3"]);
        expect(progress.at(-1)).toBe(2);
    });
});
