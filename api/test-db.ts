import path from "path";
import { fileURLToPath } from "url";
import Database from "bun:sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "api.db");

console.log("dbPath:", dbPath);

try {
  const db = new Database(dbPath);
  console.log("Database opened successfully!");
} catch (e) {
  console.error("Error opening database:", e);
}
