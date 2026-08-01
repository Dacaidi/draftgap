import { datasetFetch } from "./fetch";

export async function getVersions() {
    const res = await datasetFetch(
        "https://ddragon.leagueoflegends.com/api/versions.json",
    );
    const json = (await res.json()) as string[];

    return json;
}

export type RiotChampion = {
    id: string;
    key: string;
    name: string;
    i18n: Record<string, { name: string }>;
};

export function isStandardChampion(champion: Pick<RiotChampion, "id">) {
    // League Classic uses the internal Jade_* champion IDs. These entries
    // contain old kits and stats and are not part of modern ranked queues.
    return !champion.id.startsWith("Jade_");
}

export async function getChampions(version: string, locale = "en_US") {
    const res = await datasetFetch(
        `https://ddragon.leagueoflegends.com/cdn/${version}/data/${locale}/champion.json`,
    );
    const json = (await res.json()) as { data: Record<string, RiotChampion> };

    return Object.values(json.data)
        .map((v) => ({
            id: v.id,
            key: v.key,
            name: v.name,
        }))
        .filter(isStandardChampion);
}

export type RiotRunePath = {
    id: number;
    key: string;
    icon: string;
    name: string;
    slots: [RiotRuneSlot, RiotRuneSlot, RiotRuneSlot, RiotRuneSlot];
};

export type RiotRuneSlot = {
    runes: RiotRune[];
};

export type RiotRune = {
    id: number;
    key: string;
    icon: string;
    name: string;
    shortDesc: string;
    longDesc: string;
};

export async function getRunes(version: string) {
    const res = await datasetFetch(
        `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/runesReforged.json`,
    );
    const json = (await res.json()) as RiotRunePath[];

    return json;
}

export type RiotItem = {
    name: string;
    gold: {
        total: number;
    };
};

export async function getItems(version: string) {
    const res = await datasetFetch(
        `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`,
    );
    const json = (await res.json()) as { data: Record<string, RiotItem> };

    return json.data;
}

export type RiotSummonerSpell = {
    name: string;
    key: string;
};

export async function getSummonerSpells(version: string) {
    const res = await datasetFetch(
        `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/summoner.json`,
    );
    const json = (await res.json()) as {
        data: Record<string, RiotSummonerSpell>;
    };

    return json.data;
}
