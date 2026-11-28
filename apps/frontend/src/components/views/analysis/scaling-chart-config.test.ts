import { describe, expect, test } from "bun:test";
import {
    createScalingChartConfiguration,
    formatTimeBucketLabel,
} from "./scaling-chart-config";

const result = {
    totalRating: 0,
    championResults: [
        {
            championKey: "103",
            role: 2 as const,
            rating: 0,
        },
    ],
};

const opponentResult = {
    totalRating: 0,
    championResults: [
        {
            championKey: "238",
            role: 2 as const,
            rating: 0,
        },
    ],
};

const timeBuckets = [
    {
        start: 0,
        end: 20,
        gameShare: 0.287,
        sourceBucketStart: 0,
        sourceBucketEnd: 1,
    },
    {
        start: 20,
        end: null,
        gameShare: 0.713,
        sourceBucketStart: 2,
        sourceBucketEnd: 6,
    },
];

describe("createScalingChartConfiguration", () => {
    test("shows both teams at the same time point without requiring a point hit", () => {
        const config = createScalingChartConfiguration(
            [result],
            [opponentResult],
            timeBuckets,
            () => "Ahri",
        );

        expect(config.options?.interaction).toEqual({
            mode: "index",
            axis: "x",
            intersect: false,
        });
        expect(config.data.labels).toEqual(["0-20", "20+"]);
        expect(config.data.datasets).toHaveLength(2);
    });

    test("formats finite and open-ended adaptive buckets", () => {
        expect(formatTimeBucketLabel(timeBuckets[0])).toBe("0-20");
        expect(formatTimeBucketLabel(timeBuckets[1])).toBe("20+");
    });

    test("shows the game share once for a two-team time point", () => {
        const config = createScalingChartConfiguration(
            [result],
            [result],
            timeBuckets,
            () => "Ahri",
        );
        const afterTitle =
            config.options?.plugins?.tooltip?.callbacks?.afterTitle;

        expect(
            afterTitle?.call(
                {} as never,
                [
                    { datasetIndex: 0, dataIndex: 0 },
                    { datasetIndex: 1, dataIndex: 0 },
                ] as never,
            ),
        ).toBe("GAME SHARE - 28.7%");
    });

    test("labels both team winrates and keeps their champion breakdowns", () => {
        const config = createScalingChartConfiguration(
            [result],
            [opponentResult],
            timeBuckets,
            (championKey) => ({ "103": "Ahri", "238": "Zed" })[championKey],
        );
        const label = config.options?.plugins?.tooltip?.callbacks?.label;

        expect(
            label?.call(
                {} as never,
                { datasetIndex: 0, dataIndex: 0 } as never,
            ),
        ).toEqual(["ALLY WINRATE - 50.00%", "AHRI - 50.00%"]);
        expect(
            label?.call(
                {} as never,
                { datasetIndex: 1, dataIndex: 0 } as never,
            ),
        ).toEqual(["", "OPPONENT WINRATE - 50.00%", "ZED - 50.00%"]);
    });
});
