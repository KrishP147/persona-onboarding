// Imported first so .env.local is loaded before modules that read keys at import time.
import { config } from "dotenv";

config({ path: ".env.local" });
