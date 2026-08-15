import type { DraftExtraAnalysis } from "@draftgap/core/src/draft/extra-analysis";
import { ratingToWinrate } from "@draftgap/core/src/rating/ratings";
import type { ChartConfiguration } from "chart.js";
import { formatRating } from "../../../utils/rating";

type RatingsByTime = DraftExtraAnalysis["ratingByTime"];
type TimeBuckets = DraftExtraAnalysis["timeBuckets"];

export function formatTimeBucketLabel(bucket: TimeBuckets[number]) {
    return bucket.end === null
        ? `${bucket.start}+`
        : `${bucket.start}-${bucket.end}`;
}

export function createScalingChartConfiguration(
    allyRatings: RatingsByTime,
    opponentRatings: RatingsByTime,
    timeBuckets: TimeBuckets,
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
            labels: timeBuckets.map(formatTimeBucketLabel),
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
                mode: "index",
                axis: "x",
                intersect: false,
            },
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    callbacks: {
                        afterTitle(context) {
                            const bucket =
                                timeBuckets[context[0]?.dataIndex ?? -1];
                            if (!bucket) return "";

                            return `GAME SHARE - ${(
                                bucket.gameShare * 100
                            ).toFixed(1)}%`;
                        },
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
                                    )}%`;
                                });

                            const team =
                                context.datasetIndex === 0
                                    ? "ALLY"
                                    : "OPPONENT";

                            return [
                                ...(context.datasetIndex === 0 ? [] : [""]),
                                `${team} WINRATE - ${formatRating(result.totalRating)}%`,
                                ...championLines,
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
