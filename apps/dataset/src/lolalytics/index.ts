import type { ChampionData } from "@draftgap/core/src/models/dataset/ChampionData";
import type { ChampionSynergyData } from "@draftgap/core/src/models/dataset/ChampionSynergyData";
import type { ChampionMatchupData } from "@draftgap/core/src/models/dataset/ChampionMatchupData";
import { getRoleFromString, Role } from "@draftgap/core/src/models/Role";
import {
    type ChampionRoleData,
    defaultChampionRoleData,
} from "@draftgap/core/src/models/dataset/ChampionRoleData";
import { LOLALYTICS_ROLES, type LolalyticsRole } from "./roles";
import { getLolalyticsQwikChampion, type QwikLolalyticsData } from "./qwik";
import {
    getLolalyticsQwikChampion2,
    type LolalyticsChampion2Response,
} from "./qwik-champion2";
import type { RiotChampion } from "../riot";
import {
    DEFAULT_DATA_TIER,
    type DataTier,
} from "@draftgap/core/src/models/dataset/DataTier";
import { DatasetHttpError } from "../fetch";

export type LolalyticsFetchers = {
    getChampion: typeof getLolalyticsQwikChampion;
    getChampion2: typeof getLolalyticsQwikChampion2;
};

const defaultFetchers: LolalyticsFetchers = {
    getChampion: getLolalyticsQwikChampion,
    getChampion2: getLolalyticsQwikChampion2,
};

type LolalyticsRoleData = readonly [
    QwikLolalyticsData,
    LolalyticsChampion2Response,
];

const LOLALYTICS_TIME_BUCKETS = [[1, 2], [3], [4], [5], [6, 7]] as const;

export function groupLolalyticsStatsByTime(
    timeData: QwikLolalyticsData["sidebar"]["time"],
) {
    return LOLALYTICS_TIME_BUCKETS.map((indexes) =>
        indexes.reduce(
            (stats, index) => ({
                games: stats.games + timeData.time[index],
                wins: stats.wins + timeData.timeWin[index],
            }),
            { games: 0, wins: 0 },
        ),
    );
}

async function getBuildDataOrUndefined(
    version: string,
    championId: string,
    role: LolalyticsRole | undefined,
    tier: DataTier,
    fetchers: LolalyticsFetchers,
) {
    try {
        return await fetchers.getChampion(
            version,
            championId,
            role,
            undefined,
            undefined,
            tier,
        );
    } catch (error) {
        if (error instanceof DatasetHttpError && error.status === 404) {
            return undefined;
        }
        throw error;
    }
}

export async function getChampionRoleDataFromLolalytics(
    version: string,
    championId: string,
    role: LolalyticsRole,
    tier: DataTier,
    knownLaneShare?: number,
    fetchers: LolalyticsFetchers = defaultFetchers,
): Promise<LolalyticsRoleData | undefined> {
    const buildPromise = getBuildDataOrUndefined(
        version,
        championId,
        role,
        tier,
        fetchers,
    );

    // A zero nav share is rounded and can still contain games. Probe the build
    // endpoint first, and only skip the team request after Lolalytics confirms
    // that the role has no data.
    if (knownLaneShare === 0) {
        const buildData = await buildPromise;
        if (!buildData || buildData.header.n === 0) return undefined;

        return [
            buildData,
            await fetchers.getChampion2(version, championId, role, tier),
        ];
    }

    const [buildData, teamData] = await Promise.all([
        buildPromise,
        fetchers.getChampion2(version, championId, role, tier),
    ]);
    if (!buildData || buildData.header.n === 0) return undefined;
    return [buildData, teamData];
}

export async function getChampionDataFromLolalytics(
    version: string,
    champion: RiotChampion,
    tier: DataTier = DEFAULT_DATA_TIER,
    fetchers: LolalyticsFetchers = defaultFetchers,
) {
    const [buildResult, teamResult] = await Promise.allSettled([
        getBuildDataOrUndefined(
            version,
            champion.id,
            undefined,
            tier,
            fetchers,
        ),
        fetchers.getChampion2(version, champion.id, undefined, tier),
    ]);

    if (buildResult.status === "rejected") throw buildResult.reason;
    const championData = buildResult.value;
    if (!championData || championData.header.n === 0 || !championData.skill6) {
        return undefined;
    }
    if (teamResult.status === "rejected") throw teamResult.reason;
    const champion2Data = teamResult.value;

    const mainRole = championData.header.lane as LolalyticsRole;
    const remainingRoles = LOLALYTICS_ROLES.filter(
        (role) => role !== championData.header.lane,
    );

    const roleDataResults = await Promise.all(
        remainingRoles.map(
            async (role) =>
                [
                    role,
                    await getChampionRoleDataFromLolalytics(
                        version,
                        champion.id,
                        role,
                        tier,
                        championData.nav.lanes[role],
                        fetchers,
                    ),
                ] as const,
        ),
    );
    const roleData = new Map<LolalyticsRole, LolalyticsRoleData | undefined>([
        [mainRole, [championData, champion2Data]],
        ...roleDataResults,
    ]);

    const model: ChampionData = {
        ...champion,
        statsByRole: Object.fromEntries(
            LOLALYTICS_ROLES.map((role) => {
                const data = roleData.get(role);
                if (!data) {
                    return [getRoleFromString(role), defaultChampionRoleData()];
                }

                const [championData, champion2Data] = data;

                const championRoleData: ChampionRoleData = {
                    games: championData.header.n,
                    wins: Math.round(
                        (championData.header.n * championData.header.wr) / 100,
                    ),
                    matchup: Object.fromEntries(
                        LOLALYTICS_ROLES.map((role) => {
                            const data = championData.enemy[role];
                            if (!data) {
                                console.log(championData);
                            }

                            return [
                                getRoleFromString(role),
                                Object.fromEntries(
                                    data.map((d) => {
                                        const [
                                            championKey,
                                            winRate,
                                            ,
                                            ,
                                            ,
                                            games,
                                        ] = d;
                                        const matchup: ChampionMatchupData = {
                                            championKey: championKey.toString(),
                                            games,
                                            wins: games * (winRate / 100),
                                        };

                                        return [d[0], matchup];
                                    }),
                                ),
                            ];
                        }),
                    ) as Record<Role, Record<string, ChampionMatchupData>>,
                    synergy: Object.fromEntries(
                        LOLALYTICS_ROLES.filter((r) => r !== role).map(
                            (synergyRole) => {
                                const data = champion2Data.team[synergyRole]!;

                                return [
                                    getRoleFromString(synergyRole),
                                    Object.fromEntries(
                                        data.map((d) => {
                                            const [
                                                championKey,
                                                winRate,
                                                ,
                                                ,
                                                ,
                                                games,
                                            ] = d;
                                            const synergy: ChampionSynergyData =
                                                {
                                                    championKey:
                                                        championKey.toString(),
                                                    games,
                                                    wins:
                                                        games * (winRate / 100),
                                                };

                                            return [d[0], synergy];
                                        }),
                                    ),
                                ];
                            },
                        ),
                    ) as Record<Role, Record<string, ChampionSynergyData>>,
                    damageProfile: championData.header.damage,
                    statsByTime: groupLolalyticsStatsByTime(
                        championData.sidebar.time,
                    ),
                };

                return [getRoleFromString(role), championRoleData];
            }),
        ) as Record<Role, ChampionRoleData>,
    };

    return model;
}

/*
Matchup stats are vs champions of every rank, not just the rank of the player
We try to fix this by getting the data of the matchup for the other champion
And then use the average of the two.
*/
// export function distributeMatchupWinrates(
//     dataset: Dataset
// ) {
//     for (const championKey of Object.keys(dataset)) {
//         const champion = dataset[championKey];
//         for (const role of Object.keys(champion.statsByRole)) {
//             const roleStats = champion.statsByRole[role as Role];

//             for (const matchupRole of Object.keys(roleStats.matchup)) {
//                 const matchup = roleStats.matchup[matchupRole as Role];
//                 for (const matchupChampion of Object.keys(matchup)) {
//                     const matchupChampionStats = matchup[matchupChampion];

//                     const reverseMatchupStats =
//                         dataset[matchupChampion].statsByRole[
//                             matchupRole as Role
//                         ].matchup[role as Role][championKey];

//                     if (!reverseMatchupStats) continue;

//                     matchupChampionStats.games =
//                         (matchupChampionStats.games +
//                             reverseMatchupStats.games) /
//                         2;
//                     matchupChampionStats.wins =
//                         (matchupChampionStats.wins + reverseMatchupStats.wins) /
//                         2;
//                 }
//             }
//         }
//     }
// }
