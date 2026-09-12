import { Dataset } from "../models/dataset/Dataset";
import { Role, ROLES } from "../models/Role";
import { getStats } from "./utils";

export type RoleGameTotals = ReadonlyMap<Role, number>;
export type RolePickRateDistributions = ReadonlyMap<Role, readonly number[]>;

export const PickRateLevel = {
    VeryHigh: "very-high",
    High: "high",
    Medium: "medium",
    Low: "low",
} as const;

export type PickRateLevel = (typeof PickRateLevel)[keyof typeof PickRateLevel];

export const displayNameByPickRateLevel: Record<PickRateLevel, string> = {
    [PickRateLevel.VeryHigh]: "Very High",
    [PickRateLevel.High]: "High",
    [PickRateLevel.Medium]: "Medium",
    [PickRateLevel.Low]: "Low",
};

export function getPickRatePercentile(
    pickRate: number,
    sortedDistribution: readonly number[],
) {
    if (sortedDistribution.length === 0) return 0;

    let low = 0;
    let high = sortedDistribution.length;

    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (sortedDistribution[middle] <= pickRate) low = middle + 1;
        else high = middle;
    }

    return low / sortedDistribution.length;
}

export function getPickRateLevel(
    pickRate: number,
    sortedDistribution: readonly number[],
): PickRateLevel {
    const percentile = getPickRatePercentile(pickRate, sortedDistribution);

    if (percentile > 0.9) return PickRateLevel.VeryHigh;
    if (percentile > 0.7) return PickRateLevel.High;
    if (percentile > 0.4) return PickRateLevel.Medium;
    return PickRateLevel.Low;
}

export function getRoleGameTotals(dataset: Dataset): RoleGameTotals {
    const totals = new Map<Role, number>(ROLES.map((role) => [role, 0]));

    for (const champion of Object.values(dataset.championData)) {
        for (const role of ROLES) {
            totals.set(
                role,
                totals.get(role)! + champion.statsByRole[role].games,
            );
        }
    }

    return totals;
}

export function getRolePickRate(
    dataset: Dataset,
    championKey: string,
    role: Role,
    roleGameTotals = getRoleGameTotals(dataset),
) {
    const totalGames = roleGameTotals.get(role) ?? 0;
    if (totalGames <= 0) return 0;

    // Every match contributes two champion appearances to a role, one per team.
    // Pick rate is the share of matches containing this champion, rather than
    // the champion's share of the two available role slots.
    return Math.min(
        1,
        (getStats(dataset, championKey, role).games * 2) / totalGames,
    );
}

export function getRolePickRateDistributions(
    dataset: Dataset,
    roleGameTotals = getRoleGameTotals(dataset),
): RolePickRateDistributions {
    const distributions = new Map<Role, number[]>(
        ROLES.map((role) => [role, []]),
    );

    for (const champion of Object.values(dataset.championData)) {
        for (const role of ROLES) {
            if (champion.statsByRole[role].games <= 0) continue;

            distributions
                .get(role)!
                .push(
                    getRolePickRate(
                        dataset,
                        champion.key,
                        role,
                        roleGameTotals,
                    ),
                );
        }
    }

    for (const distribution of distributions.values()) {
        distribution.sort((a, b) => a - b);
    }

    return distributions;
}
