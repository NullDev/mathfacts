import type { FastifyPluginAsync } from "fastify";
import { createRateLimit } from "../util/rateLimit.js";
import { getDb } from "../db.js";
import Log from "../util/log.js";
import { config } from "../../config/config.js";

// ========================= //
// = Copyright (c) NullDev = //
// =     - SPDX: MIT -     = //
// ========================= //

interface FactRow {
    id: number;
    content: string;
    proof: string | null;
}

interface FactResponse {
    id: number;
    content: string;
    proof?: string;
}

function toResponse(row: FactRow): FactResponse {
    const out: FactResponse = { id: row.id, content: row.content };
    if (row.proof) out.proof = row.proof;
    return out;
}

function validateProof(value: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
    if (value === undefined || value === null || value === "") return { ok: true, value: null };
    if (typeof value !== "string") return { ok: false, error: "'proof' must be a string URL" };
    const trimmed = value.trim();
    if (trimmed.length === 0) return { ok: true, value: null };
    if (trimmed.length > 500) return { ok: false, error: "Proof URL must be 500 characters or fewer" };
    try {
        const url = new URL(trimmed);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
            return { ok: false, error: "Proof URL must use http or https" };
        }
    }
    catch {
        return { ok: false, error: "Proof must be a valid URL" };
    }
    return { ok: true, value: trimmed };
}

function fuzzyScore(content: string, query: string): number {
    const c = content.toLowerCase();
    const q = query.toLowerCase().trim();
    if (!q) return 0;

    let score = c.includes(q) ? 100 : 0;

    const words = q.split(/\s+/).filter(w => w.length > 2);
    if (words.length > 0) {
        const matched = words.filter(w => c.includes(w)).length;
        score += (matched / words.length) * 60;
    }

    return score;
}

export const factsRoutes: FastifyPluginAsync = async(app) => {
    // GET /api/facts — return all facts
    app.get("/facts", async() => {
        const db = getDb();
        const rows = db.query<FactRow, []>("SELECT id, content, proof FROM facts ORDER BY id").all();
        return rows.map(toResponse);
    });

    // GET /api/facts/random?exclude=1,2,3
    app.get<{ Querystring: { exclude?: string } }>("/facts/random", async(req, reply) => {
        const db = getDb();
        const rawExclude = req.query.exclude ?? "";

        const excludeIds: number[] = rawExclude
            .split(",")
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => Number.isFinite(n) && n > 0);

        let fact: FactRow | null;

        if (excludeIds.length > 0) {
            const placeholders = excludeIds.map(() => "?").join(", ");
            fact = db
                .query<FactRow, number[]>(
                    `SELECT id, content, proof FROM facts WHERE id NOT IN (${placeholders}) ORDER BY RANDOM() LIMIT 1`,
                )
                .get(...excludeIds);
        }
        else {
            fact = db
                .query<FactRow, []>(
                    "SELECT id, content, proof FROM facts ORDER BY RANDOM() LIMIT 1",
                )
                .get();
        }

        if (!fact) {
            return reply.code(404).send({ error: "No facts available" });
        }

        return toResponse(fact);
    });

    // GET /api/facts/search?text= — fuzzy text search
    app.get<{ Querystring: { text?: string } }>("/facts/search", async(req, reply) => {
        const text = req.query.text?.trim();
        if (!text) return reply.code(400).send({ error: "'text' query parameter is required" });

        const db = getDb();
        const facts = db.query<FactRow, []>("SELECT id, content, proof FROM facts ORDER BY id").all();

        const scored = facts
            .map(f => ({ row: f, score: fuzzyScore(f.content, text) }))
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score);

        if (scored.length === 0) return reply.code(404).send({ error: "No matching facts found" });

        const [best, ...rest] = scored;
        const bestMatch = toResponse(best.row);
        const matches = rest.map(x => toResponse(x.row));

        return { bestMatch, matches };
    });

    // GET /api/facts/:id — get a single fact by ID
    app.get<{ Params: { id: string } }>("/facts/:id", async(req, reply) => {
        const id = parseInt(req.params.id, 10);
        if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: "Invalid ID" });

        const db = getDb();
        const fact = db
            .query<FactRow, [number]>("SELECT id, content, proof FROM facts WHERE id = ?")
            .get(id);

        if (!fact) return reply.code(404).send({ error: "Fact not found" });
        return toResponse(fact);
    });

    // POST /api/facts/submit — submit a fact for review
    const submitPerMinute = createRateLimit("submit-minute", 2, 60_000, "Submission rate limit exceeded. Max 2 per minute.");
    const submitPerHour = createRateLimit("submit-hour", 10, 3_600_000, "Hourly submission limit exceeded. Max 10 per hour.");

    app.post<{ Body: { fact?: string; proof?: unknown } }>("/facts/submit", {
        onRequest: [submitPerMinute, submitPerHour],
    }, async(req, reply) => {
        const fact = req.body?.fact;

        if (!fact || typeof fact !== "string" || fact.trim().length === 0) {
            return reply.code(400).send({ error: "'fact' field is required" });
        }

        const trimmed = fact.trim();

        if (trimmed.length > 500) {
            return reply.code(400).send({ error: "Fact must be 500 characters or fewer" });
        }

        const proofResult = validateProof(req.body?.proof);
        if (!proofResult.ok) return reply.code(400).send({ error: proofResult.error });

        const db = getDb();
        db.query("INSERT INTO submissions (content, proof) VALUES (?, ?)").run(trimmed, proofResult.value);

        const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
        Log.info(`New submission from IP ${ip}: ${trimmed}${proofResult.value ? ` (proof: ${proofResult.value})` : ""}`);

        if (config.dc_webhook) {
            try {
                await fetch(config.dc_webhook, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        content: `---\nNew fact submission:\n\`\`\`${trimmed}\`\`\`${proofResult.value ? `\nProof: <${proofResult.value}>` : ""}\nFrom IP: ${ip}\n<https://nulldev.org/mathfacts/admin.html>\n---`,
                    }),
                });
            }
            catch (err) {
                Log.error("Failed to send Discord webhook:", err as Error);
            }
        }

        return reply.code(201).send({ message: "Fact submitted for review. Thank you!" });
    });

    // POST /api/facts/:id/revise — submit a revision to an existing fact
    const revisePerMinute = createRateLimit("revise-minute", 2, 60_000, "Revision rate limit exceeded. Max 2 per minute.");
    const revisePerHour = createRateLimit("revise-hour", 10, 3_600_000, "Hourly revision limit exceeded. Max 10 per hour.");

    app.post<{ Params: { id: string }; Body: { content?: string; proof?: unknown } }>("/facts/:id/revise", {
        onRequest: [revisePerMinute, revisePerHour],
    }, async(req, reply) => {
        const factId = parseInt(req.params.id, 10);
        if (!Number.isFinite(factId) || factId <= 0) {
            return reply.code(400).send({ error: "Invalid ID" });
        }

        const content = req.body?.content;
        if (!content || typeof content !== "string" || content.trim().length === 0) {
            return reply.code(400).send({ error: "'content' field is required" });
        }

        const trimmed = content.trim();
        if (trimmed.length > 500) {
            return reply.code(400).send({ error: "Content must be 500 characters or fewer" });
        }

        const proofResult = validateProof(req.body?.proof);
        if (!proofResult.ok) return reply.code(400).send({ error: proofResult.error });

        const db = getDb();
        const fact = db.query<{ id: number }, [number]>("SELECT id FROM facts WHERE id = ?").get(factId);
        if (!fact) {
            return reply.code(404).send({ error: "Fact not found" });
        }

        db.query("INSERT INTO revisions (fact_id, content, proof) VALUES (?, ?, ?)").run(factId, trimmed, proofResult.value);

        const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
        Log.info(`New revision for fact #${factId} from IP ${ip}: ${trimmed}${proofResult.value ? ` (proof: ${proofResult.value})` : ""}`);

        if (config.dc_webhook) {
            try {
                await fetch(config.dc_webhook, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        content: `---\nNew revision for fact #${factId}:\n\`\`\`${trimmed}\`\`\`${proofResult.value ? `\nProof: <${proofResult.value}>` : ""}\nFrom IP: ${ip}\n<https://nulldev.org/mathfacts/admin.html>\n---`,
                    }),
                });
            }
            catch (err) {
                Log.error("Failed to send Discord webhook:", err as Error);
            }
        }

        return reply.code(201).send({ message: "Revision submitted for review. Thank you!" });
    });
};
