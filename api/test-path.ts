import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "api.db");

console.log("__filename:", __filename);
console.log("__dirname:", __dirname);
console.log("dbPath:", dbPath);

import { existsSync } from "fs";
console.log("db exists:", existsSync(dbPath));
