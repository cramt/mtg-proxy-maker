import { z } from "zod";

const cardFrameValues = [
  "vehicle",
  "basic-land",
  "creature",
  "nonbasic-land",
  "noncreature",
  "planeswalker",
] as const;

const cardOverrideFields = z.object({
  title: z.string().optional(),
  art: z.string().optional(),
  typeText: z.string().optional(),
  oracleText: z.string().optional(),
  flavorText: z.string().optional(),
  manaCost: z.string().optional(),
  power: z.string().optional(),
  toughness: z.string().optional(),
  artist: z.string().optional(),
  frame: z.enum(cardFrameValues).optional(),
  legendary: z.boolean().optional(),
});

const scryfallCardSchema = z.object({
  name: z.string(),
  quantity: z.number().int().positive().default(1),
  language: z.string().optional(),
  variant: z.number().int().min(0).optional(),
  set: z.string().optional(),
  overrides: cardOverrideFields.optional(),
});

const customCardSchema = z.object({
  custom: z.literal(true),
  quantity: z.number().int().positive().default(1),
  title: z.string(),
  manaCost: z.string().default(""),
  art: z.string().default(""),
  typeText: z.string().default(""),
  oracleText: z.string().default(""),
  flavorText: z.string().default(""),
  power: z.string().optional(),
  toughness: z.string().optional(),
  loyalty: z.string().optional(),
  artist: z.string().optional(),
  frame: z.enum(cardFrameValues).default("noncreature"),
  legendary: z.boolean().default(false),
  language: z.string().optional(),
});

export const cardEntrySchema = z.union([scryfallCardSchema, customCardSchema]);

export type CardEntry = z.infer<typeof cardEntrySchema>;
export type ScryfallCardEntry = z.infer<typeof scryfallCardSchema>;
export type CustomCardEntry = z.infer<typeof customCardSchema>;

// Override for a card imported from an external source (Archidekt, etc.)
const sourceOverrideSchema = z.object({
  name: z.string(),
  ...cardOverrideFields.shape,
});

export type SourceOverride = z.infer<typeof sourceOverrideSchema>;

export const deckFileSchema = z.object({
  language: z.string().default("en"),
  source: z.string().optional(),
  overrides: z.array(sourceOverrideSchema).optional(),
  cards: z.array(cardEntrySchema).optional(),
});

export type DeckFile = z.infer<typeof deckFileSchema>;

export function isCustomEntry(
  entry: CardEntry,
): entry is CustomCardEntry {
  return "custom" in entry && entry.custom === true;
}
