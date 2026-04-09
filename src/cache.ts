import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

const CACHE_DIR = path.join(os.homedir(), ".cache", "mtg-proxy-maker");

function ensureCacheDir(): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function cacheKey(url: string): string {
  const hash = crypto.createHash("sha256").update(url).digest("hex");
  return path.join(CACHE_DIR, `${hash}.json`);
}

export function getCached(url: string): unknown | undefined {
  const file = cacheKey(url);
  try {
    const raw = fs.readFileSync(file, "utf-8");
    const { data, timestamp } = JSON.parse(raw);
    // Cache expires after 24 hours
    const age = Date.now() - timestamp;
    if (age < 24 * 60 * 60 * 1000) {
      return data;
    }
    // Expired — delete
    fs.unlinkSync(file);
    return undefined;
  } catch {
    return undefined;
  }
}

export function setCache(url: string, data: unknown): void {
  ensureCacheDir();
  const file = cacheKey(url);
  fs.writeFileSync(
    file,
    JSON.stringify({ data, timestamp: Date.now() }),
    "utf-8",
  );
}

export function clearCache(): void {
  try {
    const files = fs.readdirSync(CACHE_DIR);
    for (const file of files) {
      fs.unlinkSync(path.join(CACHE_DIR, file));
    }
  } catch {
    // cache dir might not exist
  }
}
