#!/usr/bin/env node

import path from "node:path";
import { Command } from "commander";
import { fetchArchidektDeck } from "./archidekt.js";
import {
  parseCardColor,
  type CardFrame,
} from "./backgrounds.js";
import { clearCache } from "./cache.js";
import type { Card } from "./card.js";
import { CardError } from "./error.js";
import { loadDecks } from "./loader.js";
import { isBiType } from "./mana.js";
import { renderPdf } from "./render.js";
import {
  type CardEntry,
  type CustomCardEntry,
  type DeckFile,
  type ScryfallCardEntry,
  type SourceOverride,
  isCustomEntry,
} from "./schema.js";
import { fetchCard, parseMana } from "./scryfall.js";

const FRAME_MAP: Record<string, CardFrame> = {
  vehicle: "Vehicle",
  "basic-land": "Basic Land",
  creature: "Creature",
  "nonbasic-land": "Nonbasic Land",
  noncreature: "Noncreature",
  planeswalker: "Planeswalker",
};

function buildCustomCard(entry: CustomCardEntry): Card {
  const manaCost = parseMana(entry.manaCost);
  const frame = FRAME_MAP[entry.frame] ?? "Noncreature";
  const isPlaneswalker = frame === "Planeswalker";

  const manaTypes = manaCost.filter(
    (t) => t !== "colorless" && t !== "x",
  );

  const color = parseCardColor(
    manaTypes,
    false,
    manaTypes.every(isBiType),
  );

  const base = {
    artUrl: entry.art,
    totalVariants: 1,
    flavorText: entry.flavorText,
    manaCost,
    oracleText: entry.oracleText,
    title: entry.title,
    typeText: entry.typeText,
    power: entry.power,
    toughness: entry.toughness,
    artist: entry.artist,
    lang: entry.language,
    aspect: {
      frame,
      color,
      legendary: entry.legendary,
    },
    verso: "default" as const,
  };

  if (isPlaneswalker) {
    return {
      ...base,
      category: "Planeswalker",
      loyalty: entry.loyalty ?? "0",
    };
  }

  return {
    ...base,
    category: "Regular",
  };
}

function applyCardOverrides(
  card: Card,
  o: Partial<SourceOverride>,
): void {
  if (o.title !== undefined) card.title = o.title;
  if (o.art !== undefined) card.artUrl = o.art;
  if (o.typeText !== undefined) card.typeText = o.typeText;
  if (o.oracleText !== undefined) card.oracleText = o.oracleText;
  if (o.flavorText !== undefined) card.flavorText = o.flavorText;
  if (o.power !== undefined) card.power = o.power;
  if (o.toughness !== undefined) card.toughness = o.toughness;
  if (o.artist !== undefined) card.artist = o.artist;
  if (o.manaCost !== undefined) card.manaCost = parseMana(o.manaCost);
  if (o.frame !== undefined) {
    card.aspect.frame = FRAME_MAP[o.frame] ?? card.aspect.frame;
  }
  if (o.legendary !== undefined) {
    card.aspect.legendary = o.legendary;
  }
}

async function resolveEntry(
  entry: CardEntry,
  defaultLang: string,
  index: number,
  total: number,
  verbose: boolean,
): Promise<Card[]> {
  if (isCustomEntry(entry)) {
    const card = buildCustomCard(entry);
    if (verbose) {
      process.stderr.write(
        `  [${index + 1}/${total}] Custom: ${entry.title} x${entry.quantity}\n`,
      );
    }
    return new Array(entry.quantity).fill(card) as Card[];
  }

  const scryfallEntry = entry as ScryfallCardEntry;
  const lang = scryfallEntry.language ?? defaultLang;
  const variant = scryfallEntry.variant ?? 0;

  if (verbose) {
    process.stderr.write(
      `  [${index + 1}/${total}] Fetching: ${scryfallEntry.name} (${lang})${scryfallEntry.set ? ` [${scryfallEntry.set}]` : ""}...\n`,
    );
  }

  const card = await fetchCard(
    scryfallEntry.name,
    lang,
    variant,
    scryfallEntry.set,
  );

  if (scryfallEntry.overrides) {
    applyCardOverrides(card, scryfallEntry.overrides);
  }

  return new Array(scryfallEntry.quantity).fill(card) as Card[];
}

async function resolveSource(
  deck: DeckFile,
  defaultLang: string,
  verbose: boolean,
): Promise<Card[]> {
  if (!deck.source) return [];

  const lang = deck.language ?? defaultLang;
  const result = await fetchArchidektDeck(deck.source, lang, verbose);

  // Build override lookup by card name
  const overrideMap = new Map<string, SourceOverride>();
  for (const o of deck.overrides ?? []) {
    overrideMap.set(o.name.toLowerCase(), o);
  }

  const cards: Card[] = [];
  for (const { card, name, quantity } of result.cards) {
    // Apply overrides if any match this card name
    const override = overrideMap.get(name.toLowerCase());
    if (override) {
      applyCardOverrides(card, override);
    }

    for (let i = 0; i < quantity; i++) {
      cards.push({ ...card });
    }
  }

  return cards;
}

interface CliOptions {
  output: string;
  language: string;
  versos?: boolean;
  verbose?: boolean;
  clearCache?: boolean;
}

const program = new Command();

program
  .name("mtg-proxy")
  .description(
    "Generate high-quality MTG proxy card PDFs from YAML/JSON deck files",
  )
  .version("2.0.0")
  .argument("<input-dir>", "Directory containing YAML/JSON deck files")
  .option("-o, --output <path>", "Output PDF path", "proxies.pdf")
  .option("-l, --language <lang>", "Default language", "en")
  .option(
    "--versos",
    "Include card back pages for double-sided printing",
  )
  .option("--verbose", "Show progress information")
  .option("--clear-cache", "Clear the API response cache before running")
  .action(async (inputDir: string) => {
    const opts = program.opts<CliOptions>();

    if (opts.clearCache) {
      clearCache();
      process.stderr.write("Cache cleared.\n");
    }

    try {
      if (opts.verbose) {
        process.stderr.write(
          `Loading deck files from ${path.resolve(inputDir)}...\n`,
        );
      }

      const decks = loadDecks(inputDir);

      if (opts.verbose) {
        process.stderr.write(
          `Loaded ${decks.length} deck file(s).\n`,
        );
      }

      const allCards: Card[] = [];
      const errors: Array<{ name: string; error: string }> = [];

      for (const deck of decks) {
        const deckLang = deck.language ?? opts.language;

        // Resolve source (e.g. Archidekt URL)
        if (deck.source) {
          try {
            const sourceCards = await resolveSource(
              deck,
              deckLang,
              opts.verbose ?? false,
            );
            allCards.push(...sourceCards);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            errors.push({ name: deck.source, error: msg });
            process.stderr.write(
              `  Warning: Failed to import source "${deck.source}": ${msg}\n`,
            );
          }
        }

        // Resolve individual card entries
        const entries = deck.cards ?? [];
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          try {
            const cards = await resolveEntry(
              entry,
              deckLang,
              i,
              entries.length,
              opts.verbose ?? false,
            );
            allCards.push(...cards);
          } catch (e) {
            const name = isCustomEntry(entry)
              ? entry.title
              : (entry as ScryfallCardEntry).name;
            const msg =
              e instanceof CardError ? e.message : String(e);
            errors.push({ name, error: msg });
            process.stderr.write(
              `  Warning: Failed to resolve "${name}": ${msg}\n`,
            );
          }
        }
      }

      if (allCards.length === 0) {
        process.stderr.write("Error: No cards could be resolved.\n");
        process.exit(1);
      }

      process.stderr.write(
        `Resolved ${allCards.length} cards (${errors.length} errors).\n`,
      );

      // Render PDF
      const outputPath = path.resolve(opts.output);
      await renderPdf({
        cards: allCards,
        outputPath,
        printVersos: opts.versos ?? false,
        verbose: opts.verbose ?? false,
      });

      const pageCount =
        Math.ceil(allCards.length / 9) * (opts.versos ? 2 : 1);
      process.stdout.write(
        `${outputPath} (${pageCount} pages, ${allCards.length} cards)\n`,
      );
    } catch (e) {
      process.stderr.write(
        `Error: ${e instanceof Error ? e.message : String(e)}\n`,
      );
      process.exit(1);
    }
  });

program.parse();
