import { describe, expect, test } from "bun:test";
import { isStandardChampion } from "./riot";

describe("isStandardChampion", () => {
    test("keeps modern Summoner's Rift champions", () => {
        expect(isStandardChampion({ id: "Ahri" })).toBe(true);
        expect(isStandardChampion({ id: "KSante" })).toBe(true);
    });

    test("removes League Classic Jade variants", () => {
        expect(isStandardChampion({ id: "Jade_Ahri" })).toBe(false);
        expect(isStandardChampion({ id: "Jade_Alistar" })).toBe(false);
    });
});
