import { describe, expect, spyOn, test } from "bun:test";
import {
    DatasetHttpError,
    DatasetRequestLimiter,
    fetchDatasetWithRetry,
    type DatasetFetch,
} from "./fetch";

describe("fetchDatasetWithRetry", () => {
    test("retries 429 responses and respects Retry-After", async () => {
        const consoleLog = spyOn(console, "log").mockImplementation(() => {});
        const delays: number[] = [];
        let attempts = 0;
        const fetcher: DatasetFetch = async () => {
            attempts++;
            if (attempts === 1) {
                return new Response("rate limited", {
                    status: 429,
                    headers: { "Retry-After": "2" },
                });
            }
            return new Response("ok");
        };

        try {
            const response = await fetchDatasetWithRetry(
                fetcher,
                "https://example.test/data",
                undefined,
                {
                    maxAttempts: 2,
                    baseDelayMs: 100,
                    random: () => 0,
                    sleep: async (delay) => {
                        delays.push(delay);
                    },
                },
            );

            expect(await response.text()).toBe("ok");
            expect(attempts).toBe(2);
            expect(delays).toEqual([2000]);
        } finally {
            consoleLog.mockRestore();
        }
    });

    test("uses exponential backoff for retryable server errors", async () => {
        const consoleLog = spyOn(console, "log").mockImplementation(() => {});
        const delays: number[] = [];
        let attempts = 0;
        const fetcher: DatasetFetch = async () => {
            attempts++;
            return attempts < 3
                ? new Response("unavailable", { status: 503 })
                : new Response("ok");
        };

        try {
            await fetchDatasetWithRetry(
                fetcher,
                "https://example.test/data",
                undefined,
                {
                    maxAttempts: 3,
                    baseDelayMs: 100,
                    random: () => 1,
                    sleep: async (delay) => {
                        delays.push(delay);
                    },
                },
            );

            expect(delays).toEqual([100, 200]);
        } finally {
            consoleLog.mockRestore();
        }
    });

    test("does not retry non-retryable client errors", async () => {
        let attempts = 0;
        const fetcher: DatasetFetch = async () => {
            attempts++;
            return new Response("missing", { status: 404 });
        };

        await expect(
            fetchDatasetWithRetry(
                fetcher,
                "https://example.test/missing",
                undefined,
                {
                    sleep: async () => {},
                },
            ),
        ).rejects.toBeInstanceOf(DatasetHttpError);
        expect(attempts).toBe(1);
    });

    test("retries network failures", async () => {
        const consoleLog = spyOn(console, "log").mockImplementation(() => {});
        let attempts = 0;
        const fetcher: DatasetFetch = async () => {
            attempts++;
            if (attempts === 1) throw new Error("connection reset");
            return new Response("ok");
        };

        try {
            await fetchDatasetWithRetry(
                fetcher,
                "https://example.test/data",
                undefined,
                {
                    maxAttempts: 2,
                    sleep: async () => {},
                },
            );
            expect(attempts).toBe(2);
        } finally {
            consoleLog.mockRestore();
        }
    });

    test("rejects a response that arrives after the timeout", async () => {
        const fetcher: DatasetFetch = async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            return new Response("late");
        };

        await expect(
            fetchDatasetWithRetry(
                fetcher,
                "https://example.test/slow",
                undefined,
                {
                    maxAttempts: 1,
                    timeoutMs: 1,
                },
            ),
        ).rejects.toThrow("timed out");
    });

    test("honors the signal carried by a Request", async () => {
        const controller = new AbortController();
        controller.abort("cancelled");
        let attempts = 0;
        const fetcher: DatasetFetch = async () => {
            attempts++;
            return new Response("ignored abort");
        };
        const request = new Request("https://example.test/data", {
            signal: controller.signal,
        });

        await expect(
            fetchDatasetWithRetry(fetcher, request),
        ).rejects.toHaveProperty("name", "AbortError");
        expect(attempts).toBe(0);
    });

    test("rejects success from a fetcher that ignores a later abort", async () => {
        const controller = new AbortController();
        let attempts = 0;
        const fetcher: DatasetFetch = async () => {
            attempts++;
            controller.abort("cancelled");
            return new Response("ignored abort");
        };

        await expect(
            fetchDatasetWithRetry(fetcher, "https://example.test/data", {
                signal: controller.signal,
            }),
        ).rejects.toHaveProperty("name", "AbortError");
        expect(attempts).toBe(1);
    });

    test("does not schedule an unsafe Retry-After delay", async () => {
        const fetcher: DatasetFetch = async () =>
            new Response("rate limited", {
                status: 429,
                headers: { "Retry-After": "999999999" },
            });
        let sleeps = 0;

        await expect(
            fetchDatasetWithRetry(
                fetcher,
                "https://example.test/data",
                undefined,
                {
                    sleep: async () => {
                        sleeps++;
                    },
                },
            ),
        ).rejects.toMatchObject({ status: 429 });
        expect(sleeps).toBe(0);
    });
});

describe("DatasetRequestLimiter", () => {
    test("never exceeds its configured concurrency", async () => {
        const limiter = new DatasetRequestLimiter(2);
        let active = 0;
        let maximumActive = 0;

        await Promise.all(
            Array.from({ length: 6 }, () =>
                limiter.run(async () => {
                    active++;
                    maximumActive = Math.max(maximumActive, active);
                    await new Promise((resolve) => setTimeout(resolve, 0));
                    active--;
                }),
            ),
        );

        expect(maximumActive).toBe(2);
    });
});
