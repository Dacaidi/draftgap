import { LOLALYTICS_ROLES, type LolalyticsRole } from "./roles";
import {
    DEFAULT_DATA_TIER,
    type DataTier,
} from "@draftgap/core/src/models/dataset/DataTier";
import { datasetFetch } from "../fetch";

export type LolalyticsChampion2Response = {
    team_h: string[];
    team: Team;
    response: Response;
};

export type Response = {
    valid: boolean;
    duration: string;
};

export type Team = {
    top: Array<number[]>;
    middle: Array<number[]>;
    bottom: Array<number[]>;
    support: Array<number[]>;
    jungle: Array<number[]>;
};

export function isLolalyticsTeamData(
    value: unknown,
    role?: LolalyticsRole,
): value is LolalyticsChampion2Response {
    if (!value || typeof value !== "object") return false;
    const data = value as Partial<LolalyticsChampion2Response>;
    if (
        data.response?.valid !== true ||
        !data.team ||
        typeof data.team !== "object"
    )
        return false;

    const presentRoles = LOLALYTICS_ROLES.filter(
        (lane) => data.team?.[lane] !== undefined,
    );
    // The champion's own lane is omitted. The default lane is unknown here,
    // but all four other lanes must be present, even when their arrays are empty.
    const requiredRoles = role
        ? LOLALYTICS_ROLES.filter((lane) => lane !== role)
        : presentRoles;
    if (requiredRoles.length < 4) return false;
    return requiredRoles.every((lane) => {
        const rows = data.team?.[lane];
        return (
            Array.isArray(rows) &&
            rows.every(
                (row) =>
                    Array.isArray(row) &&
                    row.length >= 6 &&
                    Number.isFinite(row[0]) &&
                    row[0] > 0 &&
                    Number.isFinite(row[1]) &&
                    row[1] >= 0 &&
                    row[1] <= 100 &&
                    Number.isFinite(row[5]) &&
                    row[5] >= 0,
            )
        );
    });
}

export async function getLolalyticsQwikChampion2(
    patch: string,
    championId: string,
    role?: LolalyticsRole,
    tier: DataTier = DEFAULT_DATA_TIER,
    // matchupId?: string,
    // matchupRole?: LolalyticsRole
) {
    championId = championId.toLowerCase();
    if (championId === "monkeyking") {
        championId = "wukong";
    }
    // convert patch from 12.21.1 to 12.21
    patch = patch.split(".").slice(0, 2).join(".");

    // https://a1.lolalytics.com/mega/?ep=build-team&v=1&patch=14.19&c=wukong&lane=bottom&tier=emerald_plus&queue=ranked&region=all
    const queryParams = new URLSearchParams();
    queryParams.append("ep", "build-team");
    queryParams.append("v", "1");
    queryParams.append("tier", tier);
    queryParams.append("queue", "ranked");
    queryParams.append("region", "all");
    queryParams.append("patch", patch);
    queryParams.append("c", championId);
    queryParams.append("lane", role ?? "all"); // all is default?
    // if (matchupId && matchupRole) {
    //     queryParams.append("matchup", matchupId);
    //     queryParams.append("vslane", matchupRole);
    // }

    const url = `https://a1.lolalytics.com/mega/?${queryParams.toString()}`;
    const res = await datasetFetch(url, undefined, {
        validateResponse: async (response) => {
            let data: unknown;
            try {
                data = await response.clone().json();
            } catch (error) {
                throw new Error(
                    `Invalid Lolalytics team JSON for ${championId}/${role ?? "default"} (${tier}, ${patch}): ${url}`,
                    { cause: error },
                );
            }
            if (!isLolalyticsTeamData(data, role)) {
                throw new Error(
                    `Incomplete Lolalytics team data for ${championId}/${role ?? "default"} (${tier}, ${patch}): ${url}`,
                );
            }
        },
    });

    const json = (await res.json()) as LolalyticsChampion2Response;

    return json;
}
