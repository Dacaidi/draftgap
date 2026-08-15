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
    test("shows the nearest time point without requiring a point hit", () => {
        const config = createScalingChartConfiguration(
            [result],
            [result],
            timeBuckets,
            () => "Ahri",
        );

        expect(config.options?.interaction).toEqual({
            mode: "nearest",
            intersect: false,
        });
        expect(config.data.labels).toEqual(["0-20", "20+"]);
        expect(config.data.datasets).toHaveLength(2);
    });

    test("formats finite and open-ended adaptive buckets", () => {
        expect(formatTimeBucketLabel(timeBuckets[0])).toBe("0-20");
        expect(formatTimeBucketLabel(timeBuckets[1])).toBe("20+");
    });

    test("shows the selected rank's 30-day game share", () => {
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
                [{ datasetIndex: 0, dataIndex: 0 }] as never,
            ),
        ).toBe("SHARE OF ALL GAMES (SELECTED RANK, 30 DAYS) - 28.7%");
    });

    test("keeps the champion breakdown in the tooltip", () => {
        const config = createScalingChartConfiguration(
            [result],
            [result],
            timeBuckets,
            () => "Ahri",
        );
        const label = config.options?.plugins?.tooltip?.callbacks?.label;

        expect(
            label?.call(
                {} as never,
                { datasetIndex: 0, dataIndex: 0 } as never,
            ),
        ).toEqual(["AHRI - 50.00", "", "TOTAL - 50.00"]);
    });
});
