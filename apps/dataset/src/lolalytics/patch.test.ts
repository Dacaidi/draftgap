import { describe, expect, test } from "bun:test";
import { DatasetHttpError } from "../fetch";
import { getAvailableRiotVersion } from "./patch";
import type { QwikLolalyticsData } from "./qwik";

const versions = ["16.20.1", "16.19.2", "16.19.1", "16.18.1"];

function build(patch: string, games = 1000) {
    return {
        header: { patch, n: games },
        skill6: [],
    } as unknown as QwikLolalyticsData;
}

describe("getAvailableRiotVersion", () => {
    test("uses the newest Riot patch once Lolalytics has data", async () => {
        const requests: Array<string | undefined> = [];
        const version = await getAvailableRiotVersion(
            versions,
            "gold_plus",
            async (patch) => {
                requests.push(patch);
                return build("16.20");
            },
        );
        expect(version).toBe("16.20.1");
        expect(requests).toEqual(["16.20.1"]);
    });

    test("uses matching older Riot assets when the latest patch returns 404", async () => {
        const requests: Array<[string | undefined, string | undefined]> = [];
        const version = await getAvailableRiotVersion(
            versions,
            "gold_plus",
            async (patch, _champion, _role, _matchup, _matchupRole, tier) => {
                requests.push([patch, tier]);
                if (patch)
                    throw new DatasetHttpError(
                        404,
                        "https://example.test/build",
                    );
                return build("16.19");
            },
        );
        expect(version).toBe("16.19.2");
        expect(requests).toEqual([
            ["16.20.1", "gold_plus"],
            [undefined, "gold_plus"],
        ]);
    });

    test("falls back when a new patch has zero games or silently returns the previous patch", async () => {
        for (const latest of [build("16.20", 0), build("16.19")]) {
            expect(
                await getAvailableRiotVersion(
                    versions,
                    "diamond",
                    async (patch) => (patch ? latest : build("16.19")),
                ),
            ).toBe("16.19.2");
        }
    });

    test("propagates network, rate-limit and server failures", async () => {
        for (const error of [
            new Error("Connection failed"),
            new DatasetHttpError(429, "https://example.test/build"),
            new DatasetHttpError(503, "https://example.test/build"),
        ]) {
            let requests = 0;
            await expect(
                getAvailableRiotVersion(versions, "gold", async () => {
                    requests++;
                    throw error;
                }),
            ).rejects.toBe(error);
            expect(requests).toBe(1);
        }
    });

    test("rejects an unusable default or a patch with no matching Riot assets", async () => {
        for (const data of [build("16.19", 0), build("30"), build("16.21")]) {
            await expect(
                getAvailableRiotVersion(versions, "gold", async (patch) =>
                    patch ? build("16.20", 0) : data,
                ),
            ).rejects.toThrow();
        }
    });
});
