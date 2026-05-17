import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { config } from "../../config/config";
import { getDb } from "../db.js";

// ========================= //
// = Copyright (c) NullDev = //
// =     - SPDX: MIT -     = //
// ========================= //

/* eslint-disable consistent-return */

interface SubmissionRow {
    id: number;
    content: string;
    proof: string | null;
    status: string;
    submitted_at: string;
    reviewed_at: string | null;
}

interface RevisionRow {
    id: number;
    fact_id: number;
    content: string;
    proof: string | null;
    status: string;
    submitted_at: string;
    reviewed_at: string | null;
}

interface FactRow {
    id: number;
    content: string;
    proof: string | null;
}

type WithOptionalProof<T extends { proof: string | null }> = Omit<T, "proof"> & { proof?: string };

function stripProof<T extends { proof: string | null }>(row: T): WithOptionalProof<T> {
    const { proof, ...rest } = row;
    const out = rest as WithOptionalProof<T>;
    if (proof) out.proof = proof;
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

function requireAuth(req: FastifyRequest, reply: FastifyReply): boolean {
    const auth = req.headers.authorization;
    if (!auth || !config.admin_pass || auth !== `Bearer ${config.admin_pass}`) {
        reply.code(401).send({ error: "Unauthorized" });
        return false;
    }
    return true;
}

export const adminRoutes: FastifyPluginAsync = async(app) => {
    // GET /api/admin/submissions
    app.get("/submissions", async(req, reply) => {
        if (!requireAuth(req, reply)) return;
        const db = getDb();
        const rows = db.query<SubmissionRow, []>(
            "SELECT id, content, proof, status, submitted_at, reviewed_at FROM submissions ORDER BY submitted_at DESC",
        ).all();
        return rows.map(stripProof);
    });

    // POST /api/admin/submissions/:id/approve
    app.post<{ Params: { id: string } }>("/submissions/:id/approve", async(req, reply) => {
        if (!requireAuth(req, reply)) return;
        const db = getDb();
        const id = parseInt(req.params.id, 10);

        const sub = db
            .query<Pick<SubmissionRow, "id" | "content" | "proof" | "status">, [number]>(
                "SELECT id, content, proof, status FROM submissions WHERE id = ?",
            )
            .get(id);

        if (!sub) return reply.code(404).send({ error: "Submission not found" });
        if (sub.status !== "pending") {return reply.code(400).send({ error: "Submission already reviewed" });}

        db.query("INSERT OR IGNORE INTO facts (content, proof) VALUES (?, ?)").run(sub.content, sub.proof);
        db.query(
            "UPDATE submissions SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).run(id);

        return { message: "Fact approved and added to the list" };
    });

    // POST /api/admin/submissions/:id/approve-revision
    app.post<{ Params: { id: string }; Body: { content?: unknown; proof?: unknown } }>("/submissions/:id/approve-revision", async(req, reply) => {
        if (!requireAuth(req, reply)) return;
        const db = getDb();
        const id = parseInt(req.params.id, 10);
        const content = req.body?.content;

        if (!content || typeof content !== "string" || !content.trim()) {
            return reply.code(400).send({ error: "'content' field is required" });
        }
        if (content.trim().length > 500) {
            return reply.code(400).send({ error: "Content must be 500 characters or fewer" });
        }

        const proofResult = validateProof(req.body?.proof);
        if (!proofResult.ok) return reply.code(400).send({ error: proofResult.error });

        const sub = db
            .query<Pick<SubmissionRow, "id" | "status">, [number]>(
                "SELECT id, status FROM submissions WHERE id = ?",
            )
            .get(id);

        if (!sub) return reply.code(404).send({ error: "Submission not found" });
        if (sub.status !== "pending") return reply.code(400).send({ error: "Submission already reviewed" });

        db.query("INSERT OR IGNORE INTO facts (content, proof) VALUES (?, ?)").run(content.trim(), proofResult.value);
        db.query(
            "UPDATE submissions SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).run(id);

        return { message: "Fact approved with revision and added to the list" };
    });

    // POST /api/admin/submissions/:id/reject
    app.post<{ Params: { id: string } }>("/submissions/:id/reject", async(req, reply) => {
        if (!requireAuth(req, reply)) return;
        const db = getDb();
        const id = parseInt(req.params.id, 10);

        const sub = db
            .query<Pick<SubmissionRow, "id" | "status">, [number]>(
                "SELECT id, status FROM submissions WHERE id = ?",
            )
            .get(id);

        if (!sub) return reply.code(404).send({ error: "Submission not found" });
        if (sub.status !== "pending") {return reply.code(400).send({ error: "Submission already reviewed" });}

        db.query(
            "UPDATE submissions SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).run(id);

        return { message: "Submission rejected" };
    });

    // GET /api/admin/facts — list all facts
    app.get("/facts", async(req, reply) => {
        if (!requireAuth(req, reply)) return;
        const db = getDb();
        const rows = db.query<FactRow, []>("SELECT id, content, proof FROM facts ORDER BY id").all();
        return rows.map(stripProof);
    });

    // PUT /api/admin/facts/:id — edit a fact (content and/or proof)
    app.put<{ Params: { id: string }; Body: { content?: unknown; proof?: unknown } }>("/facts/:id", async(req, reply) => {
        if (!requireAuth(req, reply)) return;
        const db = getDb();
        const id = parseInt(req.params.id, 10);

        if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: "Invalid ID" });

        const hasContent = req.body?.content !== undefined;
        const hasProof = req.body?.proof !== undefined;
        if (!hasContent && !hasProof) {
            return reply.code(400).send({ error: "At least one of 'content' or 'proof' is required" });
        }

        let newContent: string | undefined;
        if (hasContent) {
            const content = req.body?.content;
            if (!content || typeof content !== "string" || !content.trim()) {
                return reply.code(400).send({ error: "'content' field must be a non-empty string" });
            }
            if (content.trim().length > 500) {
                return reply.code(400).send({ error: "Content must be 500 characters or fewer" });
            }
            newContent = content.trim();
        }

        let newProof: string | null | undefined;
        if (hasProof) {
            const proofResult = validateProof(req.body?.proof);
            if (!proofResult.ok) return reply.code(400).send({ error: proofResult.error });
            newProof = proofResult.value;
        }

        const fact = db.query<FactRow, [number]>("SELECT id, content, proof FROM facts WHERE id = ?").get(id);
        if (!fact) return reply.code(404).send({ error: "Fact not found" });

        const sets: string[] = [];
        const params: (string | number | null)[] = [];
        if (newContent !== undefined) { sets.push("content = ?"); params.push(newContent); }
        if (newProof !== undefined) { sets.push("proof = ?"); params.push(newProof); }
        params.push(id);
        db.query(`UPDATE facts SET ${sets.join(", ")} WHERE id = ?`).run(...params);

        return { message: "Fact updated successfully" };
    });

    // DELETE /api/admin/facts/:id — delete a fact
    app.delete<{ Params: { id: string } }>("/facts/:id", async(req, reply) => {
        if (!requireAuth(req, reply)) return;
        const db = getDb();
        const id = parseInt(req.params.id, 10);

        if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: "Invalid ID" });

        const fact = db.query<FactRow, [number]>("SELECT id FROM facts WHERE id = ?").get(id);
        if (!fact) return reply.code(404).send({ error: "Fact not found" });

        db.query("DELETE FROM facts WHERE id = ?").run(id);
        return { message: "Fact deleted" };
    });

    // GET /api/admin/submissions/:id/similar — find similar existing facts
    app.get<{ Params: { id: string } }>("/submissions/:id/similar", async(req, reply) => {
        if (!requireAuth(req, reply)) return;
        const db = getDb();
        const id = parseInt(req.params.id, 10);

        const sub = db.query<Pick<SubmissionRow, "id" | "content">, [number]>(
            "SELECT id, content FROM submissions WHERE id = ?",
        ).get(id);

        if (!sub) return reply.code(404).send({ error: "Submission not found" });

        const facts = db.query<FactRow, []>("SELECT id, content, proof FROM facts ORDER BY id").all();
        const similar = facts
            .map(f => ({ row: f, score: fuzzyScore(f.content, sub.content) }))
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map(x => stripProof(x.row));

        return { similar };
    });

    // GET /api/admin/revisions
    app.get("/revisions", async(req, reply) => {
        if (!requireAuth(req, reply)) return;
        const db = getDb();
        const rows = db.query<RevisionRow, []>(
            "SELECT id, fact_id, content, proof, status, submitted_at, reviewed_at FROM revisions ORDER BY submitted_at DESC",
        ).all();
        return rows.map(stripProof);
    });

    // POST /api/admin/revisions/:id/approve — apply revision to the fact
    app.post<{ Params: { id: string } }>("/revisions/:id/approve", async(req, reply) => {
        if (!requireAuth(req, reply)) return;
        const db = getDb();
        const id = parseInt(req.params.id, 10);

        const rev = db
            .query<Pick<RevisionRow, "id" | "fact_id" | "content" | "proof" | "status">, [number]>(
                "SELECT id, fact_id, content, proof, status FROM revisions WHERE id = ?",
            )
            .get(id);

        if (!rev) return reply.code(404).send({ error: "Revision not found" });
        if (rev.status !== "pending") return reply.code(400).send({ error: "Revision already reviewed" });

        if (rev.proof !== null) {
            db.query("UPDATE facts SET content = ?, proof = ? WHERE id = ?").run(rev.content, rev.proof, rev.fact_id);
        }
        else {
            db.query("UPDATE facts SET content = ? WHERE id = ?").run(rev.content, rev.fact_id);
        }
        db.query(
            "UPDATE revisions SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).run(id);

        return { message: "Revision approved and fact updated" };
    });

    // POST /api/admin/revisions/:id/approve-revision — approve with edits
    app.post<{ Params: { id: string }; Body: { content?: unknown; proof?: unknown } }>("/revisions/:id/approve-revision", async(req, reply) => {
        if (!requireAuth(req, reply)) return;
        const db = getDb();
        const id = parseInt(req.params.id, 10);
        const content = req.body?.content;

        if (!content || typeof content !== "string" || !content.trim()) {
            return reply.code(400).send({ error: "'content' field is required" });
        }
        if (content.trim().length > 500) {
            return reply.code(400).send({ error: "Content must be 500 characters or fewer" });
        }

        const hasProof = req.body?.proof !== undefined;
        let newProof: string | null | undefined;
        if (hasProof) {
            const proofResult = validateProof(req.body?.proof);
            if (!proofResult.ok) return reply.code(400).send({ error: proofResult.error });
            newProof = proofResult.value;
        }

        const rev = db
            .query<Pick<RevisionRow, "id" | "fact_id" | "status">, [number]>(
                "SELECT id, fact_id, status FROM revisions WHERE id = ?",
            )
            .get(id);

        if (!rev) return reply.code(404).send({ error: "Revision not found" });
        if (rev.status !== "pending") return reply.code(400).send({ error: "Revision already reviewed" });

        if (hasProof) {
            db.query("UPDATE facts SET content = ?, proof = ? WHERE id = ?").run(content.trim(), newProof ?? null, rev.fact_id);
        }
        else {
            db.query("UPDATE facts SET content = ? WHERE id = ?").run(content.trim(), rev.fact_id);
        }
        db.query(
            "UPDATE revisions SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).run(id);

        return { message: "Revision approved with edits and fact updated" };
    });

    // POST /api/admin/revisions/:id/reject
    app.post<{ Params: { id: string } }>("/revisions/:id/reject", async(req, reply) => {
        if (!requireAuth(req, reply)) return;
        const db = getDb();
        const id = parseInt(req.params.id, 10);

        const rev = db
            .query<Pick<RevisionRow, "id" | "status">, [number]>(
                "SELECT id, status FROM revisions WHERE id = ?",
            )
            .get(id);

        if (!rev) return reply.code(404).send({ error: "Revision not found" });
        if (rev.status !== "pending") return reply.code(400).send({ error: "Revision already reviewed" });

        db.query(
            "UPDATE revisions SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).run(id);

        return { message: "Revision rejected" };
    });
};
