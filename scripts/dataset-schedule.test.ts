import { describe, expect, test } from "bun:test";

type DatasetWorkflow = {
    on: {
        schedule: { cron: string; timezone: string }[];
        workflow_dispatch: unknown;
    };
};

const workflow = Bun.YAML.parse(
    await Bun.file(
        new URL("../.github/workflows/dataset.yml", import.meta.url),
    ).text(),
) as DatasetWorkflow;

describe("hosted dataset schedule", () => {
    test("runs once daily in the Finnish morning without duplicate UTC schedules", () => {
        expect(workflow.on.schedule).toEqual([
            { cron: "17 9 * * *", timezone: "Europe/Helsinki" },
        ]);
    });

    test("keeps the same local time in winter and summer", () => {
        const schedule = workflow.on.schedule[0];
        const format = new Intl.DateTimeFormat("en-GB", {
            timeZone: schedule.timezone,
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
        });
        expect(format.format(new Date("2026-01-15T07:17:00Z"))).toBe("09:17");
        expect(format.format(new Date("2026-07-15T06:17:00Z"))).toBe("09:17");
    });

    test("still supports manual updates", () => {
        expect(workflow.on).toHaveProperty("workflow_dispatch");
    });
});
