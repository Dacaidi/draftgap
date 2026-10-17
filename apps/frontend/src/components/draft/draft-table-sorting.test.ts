import { describe, expect, test } from "bun:test";
import {
    createTable,
    getCoreRowModel,
    getSortedRowModel,
} from "@tanstack/solid-table";
import { DRAFT_TABLE_SORTING } from "./draft-table-sorting";

const recommendations = [
    { champion: "first", winrate: 0.56 },
    { champion: "second", winrate: 0.53 },
    { champion: "third", winrate: 0.49 },
];

function createTestTable(data = recommendations) {
    const table = createTable({
        ...DRAFT_TABLE_SORTING,
        data,
        columns: [
            { header: "Champion", accessorKey: "champion" },
            { header: "Winrate", accessorKey: "winrate" },
        ],
        state: {},
        onStateChange: () => {},
        renderFallbackValue: undefined,
        getCoreRowModel: getCoreRowModel(),
    });
    const keys = () =>
        table.getRowModel().rows.map((row) => row.original.champion);
    return { table, keys };
}

describe("fixed draft recommendation order", () => {
    test("keeps recommendations in descending winrate order", () => {
        const { table, keys } = createTestTable();
        expect(keys()).toEqual(["first", "second", "third"]);
        expect(table.getColumn("winrate")?.getCanSort()).toBe(false);
        expect(table.getColumn("champion")?.getCanSort()).toBe(false);
        for (let click = 0; click < 3; click++) {
            table.getColumn("winrate")?.getToggleSortingHandler()?.({});
            expect(keys()).toEqual(["first", "second", "third"]);
        }
    });

    test("reflects the updated ranking after recommendations are recalculated", () => {
        const { table, keys } = createTestTable();
        table.setOptions((options) => ({
            ...options,
            data: [
                { champion: "second", winrate: 0.55 },
                { champion: "third", winrate: 0.52 },
                { champion: "first", winrate: 0.51 },
            ],
        }));
        expect(keys()).toEqual(["second", "third", "first"]);
    });

    test("does not override favourite or unowned champion placement", () => {
        const { keys } = createTestTable([
            recommendations[1],
            recommendations[2],
            recommendations[0],
        ]);
        expect(keys()).toEqual(["second", "third", "first"]);
    });

    test("cannot resurrect ascending sorting after a phase change", () => {
        const { table, keys } = createTestTable();
        table.setOptions((options) => ({
            ...options,
            state: { sorting: [{ id: "winrate", desc: false }] },
            getSortedRowModel: getSortedRowModel(),
        }));
        expect(keys()).toEqual(["first", "second", "third"]);
    });
});
