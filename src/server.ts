import fs from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { createRateLimit, initRateLimitDb } from "./util/rateLimit.js";
import { initDb } from "./db.js";
import { factsRoutes } from "./routes/facts.js";
import { adminRoutes } from "./routes/admin.js";
import { config, meta } from "../config/config.js";
import sheduleCrons from "./util/crons.js";
import Log from "./util/log.js";

// ========================= //
// = Copyright (c) NullDev = //
// =     - SPDX: MIT -     = //
// ========================= //

const appname = meta.getName();
const version = meta.getVersion();
const author = meta.getAuthor();
const pad = 16 + appname.length + version.toString().length + author.length;

Log.raw(
    "\n" +
    " #" + "-".repeat(pad) + "#\n" +
    " # Started " + appname + " v" + version + " by " + author + " #\n" +
    " #" + "-".repeat(pad) + "#\n",
);

Log.info("--- START ---");
Log.info(appname + " v" + version + " by " + author);

Log.debug("Bun Environment: " + process.env.NODE_ENV, true);
Log.debug("Bun version: " + Bun.version, true);
Log.debug("OS: " + process.platform + " " + process.arch, true);

Log.wait("Ensuring data dir...");
if (!fs.existsSync(path.resolve("./data"))){
    const dataDir = path.resolve("./data");
    fs.mkdirSync(dataDir);
    fs.closeSync(fs.openSync(path.resolve(dataDir, ".gitkeep"), "w"));
    Log.done("Created missing data dir!");
}
else Log.done("Data dir exists!");

const app = Fastify({
    logger: true,
    trustProxy: true,
});

initDb();
initRateLimitDb();
sheduleCrons();

app.register(cors, { origin: "*" });
app.register(helmet);

app.addHook("onRequest", createRateLimit("global", 10, 1000, "Rate limit exceeded. Max 10 requests per second."));

app.register(fastifyStatic, {
    root: path.join(import.meta.dir, "../public"),
    prefix: "/",
});

app.get("/admin", (_req, reply) => reply.sendFile("admin.html"));

app.register(factsRoutes, { prefix: "/api" });
app.register(adminRoutes, { prefix: "/api/admin" });

const port = parseInt(config.port ?? "3000", 10);
await app.listen({ port, host: "0.0.0.0" });

process.on("unhandledRejection", (err: Error) => Log.error("Unhandled promise rejection: ", err));
