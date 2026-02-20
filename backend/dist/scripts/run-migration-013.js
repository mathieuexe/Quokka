import pg from "pg";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";
const { Client } = pg;
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
async function runMigration() {
    // Utiliser l'URL sans pooler pour avoir accès en écriture
    const databaseUrl = process.env.DATABASE_URL?.replace("-pooler", "");
    if (!databaseUrl) {
        console.error("❌ DATABASE_URL non trouvée dans .env");
        process.exit(1);
    }
    const client = new Client({
        connectionString: databaseUrl,
        ssl: {
            rejectUnauthorized: true
        }
    });
    try {
        console.log("🔌 Connexion à la base de données...");
        await client.connect();
        console.log("✅ Connecté à la base de données");
        // Lire le fichier SQL
        const migrationPath = join(__dirname, "..", "..", "..", "sql", "013_email_verification_and_2fa.sql");
        const migrationSQL = readFileSync(migrationPath, "utf-8");
        console.log("\n📝 Exécution de la migration...");
        await client.query(migrationSQL);
        console.log("✅ Migration appliquée avec succès!");
        // Vérifier que les colonnes ont été créées
        const result = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN ('email_verified', 'two_factor_enabled')
      ORDER BY column_name
    `);
        console.log("\n✅ Colonnes créées dans la table users:");
        result.rows.forEach(row => {
            console.log(`   - ${row.column_name}`);
        });
        // Vérifier que les tables ont été créées
        const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('email_verification_codes', 'two_factor_codes')
      ORDER BY table_name
    `);
        console.log("\n✅ Tables créées:");
        tables.rows.forEach(row => {
            console.log(`   - ${row.table_name}`);
        });
        console.log("\n🎉 Migration terminée avec succès!");
    }
    catch (error) {
        console.error("\n❌ Erreur lors de la migration:", error);
        process.exit(1);
    }
    finally {
        await client.end();
        console.log("\n🔌 Déconnexion de la base de données");
    }
}
runMigration();
