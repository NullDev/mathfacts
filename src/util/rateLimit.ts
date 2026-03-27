import { Database } from "bun:sqlite";
import type { FastifyRequest, FastifyReply } from "fastify";
import Log from "./log.js";

// ========================= //
// = Copyright (c) NullDev = //
// =     - SPDX: MIT -     = //
// ========================= //

let db: Database;

export function initRateLimitDb(): void {
    db = new Database("data/ratelimit.db", { create: true });

    db.run("PRAGMA journal_mode = WAL;");

    db.run(`
        CREATE TABLE IF NOT EXISTS rate_limits (
            name    TEXT NOT NULL,
            ip      TEXT NOT NULL,
            hits    INTEGER NOT NULL DEFAULT 1,
            reset_at INTEGER NOT NULL,
            PRIMARY KEY (name, ip)
        );
    `);

    Log.done("Rate limit database initialized.");
}

export function cleanupRateLimits(): void {
    const now = Date.now();
    const result = db.run("DELETE FROM rate_limits WHERE reset_at <= ?", [now]);
    Log.info(`Rate limit cleanup: removed ${result.changes} expired entries.`);
}

/**
 * Creates a rate limit preHandler for Fastify routes.
 * @param name - Unique name for this limiter
 * @param max - Max requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @param message - Error message when limit exceeded
 */
export function createRateLimit(name: string, max: number, windowMs: number, message: string) {
    const get = db.prepare<{ hits: number; reset_at: number }, [string, string]>(
        "SELECT hits, reset_at FROM rate_limits WHERE name = ? AND ip = ?",
    );
    const upsert = db.prepare(
        `INSERT INTO rate_limits (name, ip, hits, reset_at)
            VALUES (?, ?, 1, ?)
            ON CONFLICT(name, ip) DO UPDATE SET hits = hits + 1`,
    );
    const reset = db.prepare(
        `INSERT INTO rate_limits (name, ip, hits, reset_at)
            VALUES (?, ?, 1, ?)
            ON CONFLICT(name, ip) DO UPDATE SET hits = 1, reset_at = ?`,
    );

    return async(req: FastifyRequest, reply: FastifyReply): Promise<void> => {
        const {ip} = req;
        const now = Date.now();

        const row = get.get(name, ip);

        if (!row || now > row.reset_at) {
            const resetAt = now + windowMs;
            reset.run(name, ip, resetAt, resetAt);
            reply.header("X-RateLimit-Limit", max);
            reply.header("X-RateLimit-Remaining", max - 1);
            reply.header("X-RateLimit-Reset", Math.ceil(resetAt / 1000));
            return;
        }

        const newCount = row.hits + 1;
        upsert.run(name, ip, row.reset_at);

        const remaining = Math.max(0, max - newCount);
        reply.header("X-RateLimit-Limit", max);
        reply.header("X-RateLimit-Remaining", remaining);
        reply.header("X-RateLimit-Reset", Math.ceil(row.reset_at / 1000));

        if (newCount > max) {
            const retryAfter = Math.ceil((row.reset_at - now) / 1000);
            reply.header("Retry-After", retryAfter);
            reply.code(429).send({
                statusCode: 429,
                error: "Too Many Requests",
                message,
            });
        }
    };
}
