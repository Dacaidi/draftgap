import type { DraftExtraAnalysis } from "@draftgap/core/src/draft/extra-analysis";
import { ratingToWinrate } from "@draftgap/core/src/rating/ratings";
import type { ChartConfiguration } from "chart.js";
import { formatRating } from "../../../utils/rating";

export const SCALING_CHART_LABELS = ["0-20", "20-25", "25-30", "30-35", "35+"];

type RatingsByTime = DraftExtraAnalysis["ratingByTime"];

export function createScalingChartConfiguration(
    allyRatings: RatingsByTime,
    opponentRatings: RatingsByTime,
    getChampionName: (championKey: string) => string | undefined,
): ChartConfiguration<"line", number[], string> {
    const ratingsByDataset = [allyRatings, opponentRatings];
    const lineStyle = {
        borderCapStyle: "round" as const,
        borderWidth: 4,
        pointStyle: false as const,
        tension: 0.1,
    };

    return {
        type: "line",
        data: {
            labels: SCALING_CHART_LABELS,
            datasets: [
                {
                    label: "ALLY",
                    data: allyRatings.map(
                        (result) =>
                            Math.round(
                                ratingToWinrate(result.totalRating) * 10000,
                            ) / 100,
                    ),
                    borderColor: "#3c82f6",
                    ...lineStyle,
                },
                {
                    label: "OPPONENT",
                    data: opponentRatings.map(
                        (result) =>
                            Math.round(
                                ratingToWinrate(result.totalRating) * 10000,
                            ) / 100,
                    ),
                    borderColor: "#ef4444",
                    ...lineStyle,
                },
            ],
        },
        options: {
            interaction: {
                mode: "nearest",
                intersect: false,
            },
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    callbacks: {
                        label(context) {
                            const result =
                                ratingsByDataset[context.datasetIndex]?.[
                                    context.dataIndex
                                ];
                            if (!result) return [];

                            const championLines = [...result.championResults]
                                .sort((a, b) => a.role - b.role)
                                .map((championResult) => {
                                    const championName =
                                        getChampionName(
                                            championResult.championKey,
                                        ) ?? championResult.championKey;

                                    return `${championName.toUpperCase()} - ${formatRating(
                                        championResult.rating,
                                    )}`;
                                });

                            return [
                                ...championLines,
                                "",
                                `TOTAL - ${formatRating(result.totalRating)}`,
                            ];
                        },
                    },
                },
            },
            scales: {
                y: {
                    grid: {
                        color(info) {
                            if (info.tick.value === 50) return "#9b9b9b";

                            return "#404040";
                        },
                    },
                },
            },
        },
    };
}
