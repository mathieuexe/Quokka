import { db } from "../config/db.js";
export class VoteRuleError extends Error {
    status;
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}
export async function ensureMonthlyLikesReset() {
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        await client.query(`
        INSERT INTO vote_system_state (id, last_reset_month)
        VALUES (1, date_trunc('month', NOW())::date)
        ON CONFLICT (id) DO NOTHING
      `);
        const result = await client.query(`
        SELECT (date_trunc('month', NOW())::date > last_reset_month) AS needs_reset
        FROM vote_system_state
        WHERE id = 1
        FOR UPDATE
      `);
        const needsReset = result.rows[0]?.needs_reset ?? false;
        if (needsReset) {
            await client.query("UPDATE stats SET likes = 0, updated_at = NOW()");
            await client.query("DELETE FROM server_votes");
            await client.query(`
          UPDATE vote_system_state
          SET last_reset_month = date_trunc('month', NOW())::date,
              updated_at = NOW()
          WHERE id = 1
        `);
        }
        await client.query("COMMIT");
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
}
export async function voteForServer(serverId, userId) {
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const exists = await client.query("SELECT id FROM servers WHERE id = $1 LIMIT 1", [serverId]);
        if (!exists.rows[0]) {
            throw new VoteRuleError("Serveur introuvable.", 404);
        }
        const usage = await client.query(`
        SELECT
          COUNT(*) FILTER (WHERE voted_at >= date_trunc('day', NOW()))::text AS votes_today,
          MAX(voted_at)::text AS last_vote_at
        FROM server_votes
        WHERE server_id = $1
          AND user_id = $2
      `, [serverId, userId]);
        const votesToday = Number(usage.rows[0]?.votes_today ?? "0");
        const lastVoteAt = usage.rows[0]?.last_vote_at ? new Date(usage.rows[0].last_vote_at) : null;
        if (votesToday >= 3) {
            throw new VoteRuleError("Vous avez deja utilise vos 3 votes pour ce serveur aujourd'hui.", 429);
        }
        if (lastVoteAt) {
            const delayMs = 60 * 60 * 1000;
            const msSinceLastVote = Date.now() - lastVoteAt.getTime();
            if (msSinceLastVote < delayMs) {
                throw new VoteRuleError("Vous devez attendre 1h entre deux votes sur ce serveur.", 429);
            }
        }
        await client.query("INSERT INTO server_votes (server_id, user_id) VALUES ($1, $2)", [serverId, userId]);
        const likesUpdate = await client.query(`
        INSERT INTO stats (server_id, likes, views, visits, clicks)
        VALUES ($1, 1, 0, 0, 0)
        ON CONFLICT (server_id)
        DO UPDATE SET likes = stats.likes + 1, updated_at = NOW()
        RETURNING likes::text
      `, [serverId]);
        await client.query("COMMIT");
        return Number(likesUpdate.rows[0]?.likes ?? "0");
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
}
