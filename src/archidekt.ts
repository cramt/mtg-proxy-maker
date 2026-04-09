import { getCached, setCache } from "./cache.js";
import type { Card } from "./card.js";
import { CardError } from "./error.js";
import { fetchCardByPrinting } from "./scryfall.js";

interface ArchidektCard {
  quantity: number;
  card: {
    collectorNumber: string;
    oracleCard: {
      name: string;
    };
    edition: {
      editioncode: string;
    };
  };
}

interface ArchidektDeck {
  name: string;
  cards: ArchidektCard[];
}

export function parseArchidektUrl(url: string): string {
  // Supports:
  //   https://archidekt.com/decks/12345
  //   https://archidekt.com/decks/12345/deck-name
  //   https://www.archidekt.com/decks/12345
  //   Just the ID: 12345
  const match = url.match(/(?:archidekt\.com\/decks\/)?(\d+)/);
  if (!match) {
    throw new Error(
      `Invalid Archidekt URL: ${url}. Expected format: https://archidekt.com/decks/<id>`,
    );
  }
  return match[1];
}

export async function fetchArchidektDeck(
  url: string,
  lang: string,
  verbose: boolean,
): Promise<{ name: string; cards: Array<{ card: Card; name: string; quantity: number }> }> {
  const deckId = parseArchidektUrl(url);

  if (verbose) {
    process.stderr.write(
      `Fetching Archidekt deck ${deckId}...\n`,
    );
  }

  const apiUrl = `https://archidekt.com/api/decks/${deckId}/`;
  let deckData = getCached(apiUrl);

  if (!deckData) {
    const response = await fetch(apiUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "mtg-proxy-maker-cli/2.0",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch Archidekt deck: ${response.status} ${response.statusText}`,
      );
    }

    deckData = await response.json();
    setCache(apiUrl, deckData);
  }

  const deck = deckData as ArchidektDeck;

  if (verbose) {
    process.stderr.write(
      `Deck "${deck.name}" — ${deck.cards.length} unique cards\n`,
    );
  }

  const results: Array<{ card: Card; name: string; quantity: number }> = [];
  const errors: string[] = [];

  for (let i = 0; i < deck.cards.length; i++) {
    const entry = deck.cards[i];
    const name = entry.card.oracleCard.name;
    const set = entry.card.edition.editioncode;
    const collectorNumber = entry.card.collectorNumber;

    if (verbose) {
      process.stderr.write(
        `  [${i + 1}/${deck.cards.length}] ${name} (${set.toUpperCase()} #${collectorNumber})...\n`,
      );
    }

    try {
      const card = await fetchCardByPrinting(set, collectorNumber, lang);
      results.push({ card, name, quantity: entry.quantity });
    } catch (e) {
      const msg = e instanceof CardError ? e.message : String(e);
      errors.push(`${name}: ${msg}`);
      if (verbose) {
        process.stderr.write(`    Warning: ${msg}\n`);
      }
    }
  }

  if (errors.length > 0 && verbose) {
    process.stderr.write(
      `${errors.length} card(s) failed to resolve from Archidekt deck.\n`,
    );
  }

  return { name: deck.name, cards: results };
}
