import { describe, expect, test } from "bun:test";
import { DatasetHttpError } from "../fetch";
import {
    getChampionDataFromLolalytics,
    getChampionRoleDataFromLolalytics,
    groupLolalyticsStatsByTime,
    type LolalyticsFetchers,
} from ".";
import type { QwikLolalyticsData } from "./qwik";
import type { LolalyticsChampion2Response } from "./qwik-champion2";

function buildData(games: number) {
    return {
        header: { n: games },
    } as QwikLolalyticsData;
}

const teamData = {} as LolalyticsChampion2Response;

describe("groupLolalyticsStatsByTime", () => {
    test("preserves all seven source buckets for adaptive grouping", () => {
        const time = Object.fromEntries(
            Array.from({ length: 7 }, (_, index) => [
                index + 1,
                (index + 1) * 10,
            ]),
        );
        const timeWin = Object.fromEntries(
            Array.from({ length: 7 }, (_, index) => [index + 1, index + 1]),
        );

        expect(groupLolalyticsStatsByTime({ time, timeWin })).toEqual([
            { games: 10, wins: 1 },
            { games: 20, wins: 2 },
            { games: 30, wins: 3 },
            { games: 40, wins: 4 },
            { games: 50, wins: 5 },
            { games: 60, wins: 6 },
            { games: 70, wins: 7 },
        ]);
    });

    test("rejects a missing or invalid source bucket", () => {
        const time = Object.fromEntries(
            Array.from({ length: 7 }, (_, index) => [index + 1, 100]),
        );
        const timeWin = Object.fromEntries(
            Array.from({ length: 6 }, (_, index) => [index + 1, 50]),
        );

        expect(() => groupLolalyticsStatsByTime({ time, timeWin })).toThrow(
            "invalid game-duration stats for source bucket 7",
        );
    });
});

describe("getChampionRoleDataFromLolalytics", () => {
    test("does not request team data after a zero-share role returns 404", async () => {
        let teamRequests = 0;
        const fetchers: LolalyticsFetchers = {
            getChampion: async () => {
                throw new DatasetHttpError(404, "https://example.test/build");
            },
            getChampion2: async () => {
                teamRequests++;
                return teamData;
            },
        };

        const result = await getChampionRoleDataFromLolalytics(
            "16.15.1",
            "Yuumi",
            "jungle",
            "gold_plus",
            0,
            fetchers,
        );

        expect(result).toBeUndefined();
        expect(teamRequests).toBe(0);
    });

    test("does not request team data after Lolalytics reports zero games", async () => {
        let teamRequests = 0;
        const fetchers: LolalyticsFetchers = {
            getChampion: async () => buildData(0),
            getChampion2: async () => {
                teamRequests++;
                return teamData;
            },
        };

        const result = await getChampionRoleDataFromLolalytics(
            "30",
            "Ahri",
            "jungle",
            "gold_plus",
            0,
            fetchers,
        );

        expect(result).toBeUndefined();
        expect(teamRequests).toBe(0);
    });

    test("keeps rounded-to-zero roles that still contain games", async () => {
        let teamRequests = 0;
        const fetchers: LolalyticsFetchers = {
            getChampion: async () => buildData(695),
            getChampion2: async () => {
                teamRequests++;
                return teamData;
            },
        };

        const result = await getChampionRoleDataFromLolalytics(
            "30",
            "Ahri",
            "jungle",
            "gold_plus",
            0,
            fetchers,
        );

        expect(result?.[0].header.n).toBe(695);
        expect(teamRequests).toBe(1);
    });

    test("does not classify server failures as missing role data", async () => {
        let teamRequests = 0;
        const fetchers: LolalyticsFetchers = {
            getChampion: async () => {
                throw new DatasetHttpError(503, "https://example.test/build");
            },
            getChampion2: async () => {
                teamRequests++;
                return teamData;
            },
        };

        await expect(
            getChampionRoleDataFromLolalytics(
                "30",
                "Ahri",
                "jungle",
                "gold_plus",
                0,
                fetchers,
            ),
        ).rejects.toMatchObject({ status: 503 });
        expect(teamRequests).toBe(0);
    });

    test("starts both requests immediately for a known played role", async () => {
        let resolveBuild: ((data: QwikLolalyticsData) => void) | undefined;
        let teamRequests = 0;
        const fetchers: LolalyticsFetchers = {
            getChampion: async () =>
                await new Promise<QwikLolalyticsData>((resolve) => {
                    resolveBuild = resolve;
                }),
            getChampion2: async () => {
                teamRequests++;
                return teamData;
            },
        };

        const result = getChampionRoleDataFromLolalytics(
            "30",
            "Ahri",
            "middle",
            "gold_plus",
            99,
            fetchers,
        );
        await Promise.resolve();

        expect(teamRequests).toBe(1);
        resolveBuild?.(buildData(1000));
        expect((await result)?.[0].header.n).toBe(1000);
    });
});

describe("getChampionDataFromLolalytics", () => {
    const champion = {
        id: "Missing",
        key: "99999",
        name: "Missing",
        i18n: {},
    };

    test("treats a default build 404 as explicit no data", async () => {
        const fetchers: LolalyticsFetchers = {
            getChampion: async () => {
                throw new DatasetHttpError(404, "https://example.test/build");
            },
            getChampion2: async () => teamData,
        };

        expect(
            await getChampionDataFromLolalytics(
                "16.15.1",
                champion,
                "gold_plus",
                fetchers,
            ),
        ).toBeUndefined();
    });

    test("propagates a default build server failure", async () => {
        const fetchers: LolalyticsFetchers = {
            getChampion: async () => {
                throw new DatasetHttpError(503, "https://example.test/build");
            },
            getChampion2: async () => teamData,
        };

        await expect(
            getChampionDataFromLolalytics(
                "16.15.1",
                champion,
                "gold_plus",
                fetchers,
            ),
        ).rejects.toMatchObject({ status: 503 });
    });
});
