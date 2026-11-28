type ChampionImageData = {
    id: string;
    key: string;
};

const DDRAGON_BASE_URL = "https://ddragon.leagueoflegends.com/cdn";
const COMMUNITY_DRAGON_BASE_URL =
    "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default";
const COMMUNITY_DRAGON_SPLASH_OVERRIDES: Record<
    string,
    { skinDirectory: string; file: string }
> = {
    Hwei: {
        skinDirectory: "skin0",
        file: "hwei_splash_centered_0.jpg",
    },
    Locke: {
        skinDirectory: "base",
        file: "locke_splash_centered_0.locke.jpg",
    },
    XinZhao: {
        skinDirectory: "base",
        file: "xinzhaorework_splash_centered_0.jpg",
    },
};

function dataDragonSplashId(championId: string) {
    return championId === "Fiddlesticks" ? "FiddleSticks" : championId;
}

export function championIconSources(
    version: string,
    champion: ChampionImageData,
) {
    return {
        primary: `${DDRAGON_BASE_URL}/${encodeURIComponent(version)}/img/champion/${encodeURIComponent(champion.id)}.png`,
        fallback: `${COMMUNITY_DRAGON_BASE_URL}/v1/champion-icons/${encodeURIComponent(champion.key)}.png`,
    };
}

export function championSplashSources(champion: ChampionImageData) {
    const dataDragonId = dataDragonSplashId(champion.id);
    const communityDragonId = champion.id.toLocaleLowerCase("en-US");
    const communityDragonSplash = COMMUNITY_DRAGON_SPLASH_OVERRIDES[
        champion.id
    ] ?? {
        skinDirectory: "base",
        file: `${communityDragonId}_splash_centered_0.jpg`,
    };

    return {
        primary: `${DDRAGON_BASE_URL}/img/champion/centered/${encodeURIComponent(dataDragonId)}_0.jpg`,
        fallback: `${COMMUNITY_DRAGON_BASE_URL}/assets/characters/${encodeURIComponent(communityDragonId)}/skins/${encodeURIComponent(communityDragonSplash.skinDirectory)}/images/${encodeURIComponent(communityDragonSplash.file)}`,
    };
}

export function applyImageFallback(
    image: Pick<HTMLImageElement, "src">,
    fallback: string,
) {
    if (image.src === fallback) return;
    image.src = fallback;
}
