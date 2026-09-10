import { Dataset } from "../models/dataset/Dataset";
import { Role, ROLES } from "../models/Role";
import { getStats } from "./utils";

export type RoleGameTotals = ReadonlyMap<Role, number>;

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
