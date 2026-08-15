import { describe, expect, test } from "bun:test";
import {
    SCALING_CHART_LABELS,
    createScalingChartConfiguration,
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

describe("createScalingChartConfiguration", () => {
    test("shows the nearest time point without requiring a point hit", () => {
        const config = createScalingChartConfiguration(
            [result],
            [result],
            () => "Ahri",
        );

        expect(config.options?.interaction).toEqual({
            mode: "nearest",
            intersect: false,
        });
        expect(config.data.labels).toEqual(SCALING_CHART_LABELS);
        expect(config.data.datasets).toHaveLength(2);
    });

    test("keeps the champion breakdown in the tooltip", () => {
        const config = createScalingChartConfiguration(
            [result],
            [result],
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
