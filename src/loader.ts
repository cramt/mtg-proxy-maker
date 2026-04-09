import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { deckFileSchema, type DeckFile } from "./schema.js";

export function loadDecks(dirPath: string): DeckFile[] {
  const absoluteDir = path.resolve(dirPath);

  if (!fs.existsSync(absoluteDir)) {
    throw new Error(`Directory not found: ${absoluteDir}`);
  }

  const stat = fs.statSync(absoluteDir);
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${absoluteDir}`);
  }

  const files = fs.readdirSync(absoluteDir).filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return [".yaml", ".yml", ".json"].includes(ext);
  });

  if (files.length === 0) {
    throw new Error(
      `No .yaml, .yml, or .json files found in ${absoluteDir}`,
    );
  }

  const decks: DeckFile[] = [];

  for (const file of files.sort()) {
    const filePath = path.join(absoluteDir, file);
    const raw = fs.readFileSync(filePath, "utf-8");

    let parsed: unknown;
    const ext = path.extname(file).toLowerCase();

    if (ext === ".json") {
      parsed = JSON.parse(raw);
    } else {
      parsed = YAML.parse(raw);
    }

    const result = deckFileSchema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `  ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      throw new Error(`Invalid deck file ${file}:\n${issues}`);
    }

    decks.push(result.data);
  }

  return decks;
}
