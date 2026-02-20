import { Pool } from "pg";
import { env } from "./env.js";
export const db = new Pool({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    keepAlive: true
});
db.on("connect", (client) => {
    void client.query("SET client_encoding TO 'UTF8'");
});
// Prevent process crash when pooled idle connection drops.
db.on("error", (error) => {
    console.error("PostgreSQL pool error:", error.message);
});
