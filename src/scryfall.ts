import { parseCardColor, parseCardFrame } from "./backgrounds.js";
import { getCached, setCache } from "./cache.js";
import type { Card } from "./card.js";
import { CardError } from "./error.js";
import { isBiType, type ManaLetter, manaLetters, manaLetterToType as manaLetterToTypeMap, type ManaType } from "./mana.js";

const SCRYFALL_DELAY_MS = 100;
let lastRequestTime = 0;

async function rateLimitedFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < SCRYFALL_DELAY_MS) {
    await new Promise((resolve) =>
      setTimeout(resolve, SCRYFALL_DELAY_MS - elapsed),
    );
  }
  lastRequestTime = Date.now();
  return fetch(url, {
    ...init,
    headers: {
      "User-Agent": "mtg-proxy-maker-cli/2.0",
      Accept: "application/json",
      ...init?.headers,
    },
  });
}

/**
 * Fetch JSON from a URL with disk caching (24h TTL).
 * Skips cache for non-GET or when data is an error response.
 */
async function cachedFetchJson(url: string): Promise<any> {
  const cached = getCached(url);
  if (cached !== undefined) {
    return cached;
  }

  const response = await rateLimitedFetch(url);
  const data: any = await response.json();

  // Only cache successful responses
  if (data.object !== "error" && data.status !== 404) {
    setCache(url, data);
  }

  return data;
}

export function parseMana(manaCostString: string = ""): ManaType[] {
  const manaCost = manaCostString.match(/\{(.+?)\}/g) ?? [];
  return manaCost.flatMap((manaWithBraces): ManaType | ManaType[] => {
    const mana = manaWithBraces.replace("{", "").replace("}", "");
    return manaLetterToType(mana);
  });
}

export function manaLetterToType(manaLetter: string): ManaType | ManaType[] {
  if (manaLetters.includes(manaLetter as ManaLetter)) {
    return manaLetterToTypeMap[manaLetter as ManaLetter];
  } else {
    return [...new Array(parseInt(manaLetter) || 0)].map(
      () => "colorless" as const,
    );
  }
}

function needScan(scryfallResult: any): boolean {
  return (
    ["Stickers", "Dungeon"].includes(scryfallResult["type_line"]) ||
    [
      "split",
      "modal_dfc",
      "adventure",
      "planar",
      "host",
      "class",
      "saga",
      "flip",
    ].includes(scryfallResult["layout"])
  );
}

function getCardScanUrl(
  scryfallResult: any,
  { ifNecessary }: { ifNecessary: boolean },
): string | undefined {
  if (ifNecessary && !needScan(scryfallResult)) {
    return undefined;
  }

  let uris;

  if ("image_uris" in scryfallResult) {
    uris = scryfallResult["image_uris"];
  } else if ("card_faces" in scryfallResult) {
    uris = scryfallResult["card_faces"].find(
      (f: any) => "image_uris" in f,
    )?.["image_uris"];
  }

  return uris?.["large"] ?? uris?.["normal"] ?? uris?.["small"];
}

export async function fetchCard(
  title: string,
  lang = "en",
  variant: number = 0,
  set?: string,
): Promise<Card> {
  const setFilter = set ? ` set:${set}` : "";
  let [frCards, enCards]: [any, any] = await Promise.all([
    cachedFetchJson(
      `https://api.scryfall.com/cards/search/?q=((!"${title}" lang:${lang}) or ("${title}" t:token)) -t:card order:released direction:asc${setFilter}`,
    ).catch((e) => {
      throw new CardError(title, `not found for ${lang}: ${e.message}`);
    }),
    cachedFetchJson(
      `https://api.scryfall.com/cards/search/?q=((!"${title}") or ("${title}" t:token)) -t:card order:released direction:asc${setFilter}`,
    ).catch((e) => {
      throw new CardError(title, `Not found: ${e.message}`);
    }),
  ]);

  if (enCards.status === 404) {
    throw new CardError(title, "Not found");
  }

  if (frCards.status === 404) {
    frCards = enCards;
  }

  const fr = frCards.data?.find((c: any) => c.name.includes(title));
  const en = enCards.data?.find((c: any) => c.name.includes(title));

  if (!fr || !en) {
    throw new CardError(title, "Not found");
  }

  const variants = await fetchVariants(en["name"]);

  const biFaced =
    en["layout"] === "transform" &&
    "card_faces" in en &&
    en["card_faces"].length === 2;

  const frCardFaceInfo = biFaced ? fr["card_faces"][0] : fr;
  const enCardFaceInfo = biFaced ? en["card_faces"][0] : en;
  const frReverseFaceInfo = biFaced ? fr["card_faces"][1] : fr;
  const enReverseFaceInfo = biFaced ? en["card_faces"][1] : en;

  const colorsToUse: string[] = enCardFaceInfo["type_line"]
    ?.toLowerCase()
    .includes("land")
    ? frCardFaceInfo["color_identity"]
    : (frCardFaceInfo["colors"] ?? frCardFaceInfo["color_identity"]);

  const manaTypes = colorsToUse.flatMap(manaLetterToType);
  const manaCost = parseMana(enCardFaceInfo["mana_cost"]);

  const overrideWithScanUrl =
    getCardScanUrl(frCardFaceInfo, { ifNecessary: true }) ??
    getCardScanUrl(enCardFaceInfo, { ifNecessary: true });

  const card: Card = {
    title: frCardFaceInfo["printed_name"] || frCardFaceInfo["name"],
    manaCost,
    artUrl: enCardFaceInfo["image_uris"]?.["art_crop"],
    totalVariants: variants.length,
    aspect: {
      frame: parseCardFrame(enCardFaceInfo["type_line"]),
      color: parseCardColor(
        manaTypes,
        enCardFaceInfo["type_line"].toLowerCase().includes("artifact") &&
          !enCardFaceInfo["type_line"].toLowerCase().includes("vehicle"),
        manaCost
          .filter((type) => type !== "colorless" && type !== "x")
          .every(isBiType),
      ),
      legendary:
        en["frame_effects"]?.includes("legendary") ||
        enCardFaceInfo["type_line"].toLowerCase().includes("legendary"),
    },
    typeText:
      frCardFaceInfo["printed_type_line"] ||
      frCardFaceInfo["type_line"] ||
      enCardFaceInfo["printed_type_line"] ||
      enCardFaceInfo["type_line"],
    oracleText:
      frCardFaceInfo["printed_text"] || frCardFaceInfo["oracle_text"],
    flavorText: frCardFaceInfo["flavor_text"],
    power: frCardFaceInfo["power"],
    toughness: frCardFaceInfo["toughness"],
    artist: frCardFaceInfo["artist"],
    collectorNumber: fr["collector_number"],
    lang: fr["lang"],
    rarity: fr["rarity"],
    set: fr["set"],
    category: enCardFaceInfo["type_line"]
      ?.toLowerCase()
      .includes("planeswalker")
      ? "Planeswalker"
      : "Regular",
    loyalty: enCardFaceInfo["loyalty"],
    overrideWithScanUrl,
  };

  const verso: Card["verso"] = biFaced
    ? ({
        title:
          frReverseFaceInfo["printed_name"] || frReverseFaceInfo["name"],
        manaCost,
        artUrl: enReverseFaceInfo["image_uris"]?.["art_crop"],
        totalVariants: variants.length,
        aspect: {
          frame: parseCardFrame(enReverseFaceInfo["type_line"]),
          color: parseCardColor(
            manaTypes,
            enReverseFaceInfo["type_line"]
              .toLowerCase()
              .includes("artifact") &&
              !enReverseFaceInfo["type_line"]
                .toLowerCase()
                .includes("vehicle"),
            manaCost
              .filter((type) => type !== "colorless" && type !== "x")
              .every(isBiType),
          ),
          legendary:
            en["frame_effects"]?.includes("legendary") ||
            enReverseFaceInfo["type_line"]
              .toLowerCase()
              .includes("legendary"),
        },
        typeText:
          frReverseFaceInfo["printed_type_line"] ||
          frReverseFaceInfo["type_line"] ||
          enReverseFaceInfo["printed_type_line"] ||
          enReverseFaceInfo["type_line"],
        oracleText:
          frReverseFaceInfo["printed_text"] ||
          frReverseFaceInfo["oracle_text"],
        flavorText: frReverseFaceInfo["flavor_text"],
        power: frReverseFaceInfo["power"],
        toughness: frReverseFaceInfo["toughness"],
        artist: frReverseFaceInfo["artist"],
        collectorNumber: fr["collector_number"],
        lang: fr["lang"],
        rarity: fr["rarity"],
        set: fr["set"],
        category: enReverseFaceInfo["type_line"]
          ?.toLowerCase()
          .includes("planeswalker")
          ? "Planeswalker"
          : "Regular",
        loyalty: enReverseFaceInfo["loyalty"],
        overrideWithScanUrl,
      } satisfies Card)
    : "default";

  return {
    verso,
    ...card,
    ...variants[variant % variants.length],
  } as Card;
}

export async function fetchVariants(
  title: string,
): Promise<Partial<Card>[]> {
  const response = await cachedFetchJson(
    `https://api.scryfall.com/cards/search/?q=!"${title}" unique:art prefer:newest`,
  );

  if (!response.data) {
    return [];
  }

  return response.data
    .map((card: any, _i: number, arr: any[]): Partial<Card> => {
      let partial: Partial<Card> = {
        artUrl: card["image_uris"]?.["art_crop"],
        artist: card["artist"],
        collectorNumber: card["collector_number"],
        set: card["set"],
        rarity: card["rarity"],
        totalVariants: arr.length,
      };

      if (card["type_line"]?.toLowerCase().includes("token")) {
        const manaTypes = (
          card["colors"] ?? card["color_identity"]
        ).flatMap(manaLetterToType);
        const manaCost = parseMana(card["mana_cost"]);

        partial = {
          ...partial,
          typeText: card["type_line"],
          oracleText: card["printed_text"] || card["oracle_text"],
          flavorText: card["flavor_text"],
          power: card["power"],
          toughness: card["toughness"],
          aspect: {
            frame: parseCardFrame(card["type_line"]),
            color: parseCardColor(
              manaTypes,
              card["type_line"].toLowerCase().includes("artifact") &&
                !card["type_line"].toLowerCase().includes("vehicle"),
              manaCost
                .filter(
                  (type) => type !== "colorless" && type !== "x",
                )
                .every(isBiType),
            ),
            legendary:
              card["frame_effects"]?.includes("legendary") ||
              card["type_line"].toLowerCase().includes("legendary"),
          },
        };
      }

      return partial;
    })
    .filter((v: any) => v?.artUrl != null);
}

/**
 * Fetch a card by its exact set code and collector number.
 * Uses Scryfall's /cards/:set/:number endpoint for precise printing matches.
 */
export async function fetchCardByPrinting(
  set: string,
  collectorNumber: string,
  lang = "en",
): Promise<Card> {
  // Fetch the exact printing
  const cardData = await cachedFetchJson(
    `https://api.scryfall.com/cards/${set.toLowerCase()}/${collectorNumber}`,
  );

  if (cardData.status === 404 || cardData.object === "error") {
    throw new CardError(
      `${set}/${collectorNumber}`,
      cardData.details ?? "Card not found",
    );
  }

  // If the user wants a non-English version, also try fetching the localized one
  let localizedData = cardData;
  if (lang !== "en") {
    const localized = await cachedFetchJson(
      `https://api.scryfall.com/cards/${set.toLowerCase()}/${collectorNumber}/${lang}`,
    );
    if (localized.object !== "error") {
      localizedData = localized;
    }
  }

  return parseScryfallCard(cardData, localizedData);
}

/**
 * Parse a Scryfall card JSON object (and optional localized version) into a Card.
 */
function parseScryfallCard(en: any, fr: any): Card {
  const biFaced =
    en["layout"] === "transform" &&
    "card_faces" in en &&
    en["card_faces"].length === 2;

  const enFace = biFaced ? en["card_faces"][0] : en;
  const frFace = biFaced ? fr["card_faces"][0] : fr;
  const enBack = biFaced ? en["card_faces"][1] : en;
  const frBack = biFaced ? fr["card_faces"][1] : fr;

  const colorsToUse: string[] = enFace["type_line"]
    ?.toLowerCase()
    .includes("land")
    ? frFace["color_identity"]
    : (frFace["colors"] ?? frFace["color_identity"]);

  const manaTypes = (colorsToUse ?? []).flatMap(manaLetterToType);
  const manaCost = parseMana(enFace["mana_cost"]);

  const overrideWithScanUrl =
    getCardScanUrl(frFace, { ifNecessary: true }) ??
    getCardScanUrl(enFace, { ifNecessary: true });

  const card: Card = {
    title: frFace["printed_name"] || frFace["name"],
    manaCost,
    artUrl: enFace["image_uris"]?.["art_crop"],
    totalVariants: 1,
    aspect: {
      frame: parseCardFrame(enFace["type_line"]),
      color: parseCardColor(
        manaTypes,
        enFace["type_line"]?.toLowerCase().includes("artifact") &&
          !enFace["type_line"]?.toLowerCase().includes("vehicle"),
        manaCost
          .filter((type) => type !== "colorless" && type !== "x")
          .every(isBiType),
      ),
      legendary:
        en["frame_effects"]?.includes("legendary") ||
        enFace["type_line"]?.toLowerCase().includes("legendary"),
    },
    typeText:
      frFace["printed_type_line"] ||
      frFace["type_line"] ||
      enFace["printed_type_line"] ||
      enFace["type_line"],
    oracleText: frFace["printed_text"] || frFace["oracle_text"] || "",
    flavorText: frFace["flavor_text"] || "",
    power: frFace["power"],
    toughness: frFace["toughness"],
    artist: frFace["artist"],
    collectorNumber: en["collector_number"],
    lang: fr["lang"] ?? en["lang"],
    rarity: en["rarity"],
    set: en["set"],
    category: enFace["type_line"]?.toLowerCase().includes("planeswalker")
      ? "Planeswalker"
      : "Regular",
    loyalty: enFace["loyalty"],
    overrideWithScanUrl,
  };

  const verso: Card["verso"] = biFaced
    ? ({
        title: frBack["printed_name"] || frBack["name"],
        manaCost,
        artUrl: enBack["image_uris"]?.["art_crop"],
        totalVariants: 1,
        aspect: {
          frame: parseCardFrame(enBack["type_line"]),
          color: parseCardColor(
            manaTypes,
            enBack["type_line"]?.toLowerCase().includes("artifact") &&
              !enBack["type_line"]?.toLowerCase().includes("vehicle"),
            manaCost
              .filter((type) => type !== "colorless" && type !== "x")
              .every(isBiType),
          ),
          legendary:
            en["frame_effects"]?.includes("legendary") ||
            enBack["type_line"]?.toLowerCase().includes("legendary"),
        },
        typeText:
          frBack["printed_type_line"] ||
          frBack["type_line"] ||
          enBack["printed_type_line"] ||
          enBack["type_line"],
        oracleText: frBack["printed_text"] || frBack["oracle_text"] || "",
        flavorText: frBack["flavor_text"] || "",
        power: frBack["power"],
        toughness: frBack["toughness"],
        artist: frBack["artist"],
        collectorNumber: en["collector_number"],
        lang: fr["lang"] ?? en["lang"],
        rarity: en["rarity"],
        set: en["set"],
        category: enBack["type_line"]?.toLowerCase().includes("planeswalker")
          ? "Planeswalker"
          : "Regular",
        loyalty: enBack["loyalty"],
        overrideWithScanUrl,
      } satisfies Card)
    : "default";

  return { verso, ...card } as Card;
}
