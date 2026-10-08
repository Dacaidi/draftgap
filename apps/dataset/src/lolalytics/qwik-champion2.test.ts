import { afterEach, describe, expect, test } from "bun:test";
import { setDatasetFetch } from "../fetch";
import {
    getLolalyticsQwikChampion2,
    isLolalyticsTeamData,
} from "./qwik-champion2";

function teamData() {
    return {
        response: { valid: true, duration: "10" },
        team: {
            top: [[777, 52.24, 0.66, -0.01, 4.69, 603]],
            jungle: [],
            bottom: [],
            support: [],
        },
    };
}

afterEach(() =>
    setDatasetFetch((input, init) => globalThis.fetch(input, init)),
);

describe("Lolalytics team data", () => {
    test("accepts an omitted own lane and empty opponent-lane arrays", () => {
        expect(isLolalyticsTeamData(teamData(), "middle")).toBe(true);
        expect(isLolalyticsTeamData(teamData())).toBe(true);
    });

    test("rejects the missing team response seen during patch rollout", () => {
        expect(isLolalyticsTeamData({ response: { valid: true } })).toBe(false);
        expect(isLolalyticsTeamData(null)).toBe(false);
        expect(
            isLolalyticsTeamData({ ...teamData(), response: { valid: false } }),
        ).toBe(false);
        expect(
            isLolalyticsTeamData(
                { ...teamData(), team: { top: [] } },
                "middle",
            ),
        ).toBe(false);
        expect(
            isLolalyticsTeamData({
                ...teamData(),
                team: { ...teamData().team, top: [[777, 52.24]] },
            }),
        ).toBe(false);
    });

    test("recovers the real team fetch after a temporary incomplete response", async () => {
        let requests = 0;
        setDatasetFetch(async () =>
            Response.json(
                ++requests === 1 ? { response: { valid: false } } : teamData(),
            ),
        );
        const data = await getLolalyticsQwikChampion2(
            "16.20.1",
            "Ahri",
            "middle",
            "emerald",
        );
        expect(requests).toBe(2);
        expect(data.team.top[0]?.[5]).toBe(603);
    });
});
