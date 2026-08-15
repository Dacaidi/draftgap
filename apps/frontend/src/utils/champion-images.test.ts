import { describe, expect, test } from "bun:test";
import {
    championIconSources,
    championSplashSources,
    applyImageFallback,
} from "./champion-images";

describe("champion image sources", () => {
    test("uses Kled's Riot ID and numeric key", () => {
        const champion = { id: "Kled", key: "240" };

        expect(championIconSources("16.16.1", champion)).toEqual({
            primary:
                "https://ddragon.leagueoflegends.com/cdn/16.16.1/img/champion/Kled.png",
            fallback:
                "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/240.png",
        });
        expect(championSplashSources(champion)).toEqual({
            primary:
                "https://ddragon.leagueoflegends.com/cdn/img/champion/centered/Kled_0.jpg",
            fallback:
                "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/characters/kled/skins/base/images/kled_splash_centered_0.jpg",
        });
    });

    test("keeps the Data Dragon Fiddlesticks splash spelling", () => {
        expect(championSplashSources({ id: "Fiddlesticks", key: "9" })).toEqual(
            {
                primary:
                    "https://ddragon.leagueoflegends.com/cdn/img/champion/centered/FiddleSticks_0.jpg",
                fallback:
                    "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/characters/fiddlesticks/skins/base/images/fiddlesticks_splash_centered_0.jpg",
            },
        );
    });

    test("uses the Riot ID instead of the displayed champion name", () => {
        expect(championSplashSources({ id: "MonkeyKing", key: "62" })).toEqual({
            primary:
                "https://ddragon.leagueoflegends.com/cdn/img/champion/centered/MonkeyKing_0.jpg",
            fallback:
                "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/characters/monkeyking/skins/base/images/monkeyking_splash_centered_0.jpg",
        });
    });

    test("supports Community Dragon's exceptional splash filenames", () => {
        expect(
            championSplashSources({ id: "Hwei", key: "910" }).fallback,
        ).toEndWith(
            "/assets/characters/hwei/skins/skin0/images/hwei_splash_centered_0.jpg",
        );
        expect(
            championSplashSources({ id: "XinZhao", key: "5" }).fallback,
        ).toEndWith(
            "/assets/characters/xinzhao/skins/base/images/xinzhaorework_splash_centered_0.jpg",
        );
        expect(
            championSplashSources({ id: "Locke", key: "805" }).fallback,
        ).toEndWith(
            "/assets/characters/locke/skins/base/images/locke_splash_centered_0.locke.jpg",
        );
    });
});

test("an image fallback is applied once", () => {
    const image = { src: "primary" };

    applyImageFallback(image, "fallback");
    expect(image.src).toBe("fallback");

    applyImageFallback(image, "fallback");
    expect(image.src).toBe("fallback");
});
