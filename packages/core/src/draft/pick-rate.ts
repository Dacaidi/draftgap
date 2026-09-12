import { Dataset } from "../models/dataset/Dataset";
import { Role, ROLES } from "../models/Role";
import { getStats } from "./utils";

export type RoleGameTotals = ReadonlyMap<Role, number>;

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

export function getPickRateLevel(pickRate: number): PickRateLevel {
    if (pickRate >= 0.1) return PickRateLevel.VeryHigh;
    if (pickRate >= 0.05) return PickRateLevel.High;
    if (pickRate >= 0.02) return PickRateLevel.Medium;
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
