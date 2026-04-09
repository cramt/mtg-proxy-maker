# CLAUDE.md

## What this project is

A declarative CLI that generates print-ready MTG proxy card PDFs. You define your deck in YAML/JSON files — either by listing card names, importing from an Archidekt URL, or defining fully custom cards — and the CLI fetches card data from Scryfall, renders high-quality proxy cards with vector frames and custom fonts, and outputs a paginated A4 PDF (3x3 card grid per page).

This was originally a Solid.js webapp. The card rendering logic (SVG frames, mm-based positioning, font sizing, symbol injection) was ported to plain HTML string templates and rendered via Playwright headless Chromium.

## Commands

```bash
pnpm install              # install deps
pnpm typecheck            # type-check (tsc --noEmit)
pnpm build                # bundle to dist/ (tsup)

# Run the CLI
pnpm tsx src/index.ts <deck-folder> [options]

# Options:
#   -o, --output <path>     Output PDF path (default: proxies.pdf)
#   -l, --language <lang>   Default language (default: en)
#   --versos                Include card back pages
#   --verbose               Show progress
#   --clear-cache           Clear Scryfall/Archidekt API cache
```

## Architecture

```
src/
  index.ts          CLI entry (commander), resolves cards, invokes renderer
  schema.ts         Zod schemas for deck file validation
  loader.ts         Reads YAML/JSON files from a directory
  archidekt.ts      Fetches deck lists from Archidekt API
  scryfall.ts       Scryfall API client (rate-limited, cached)
  cache.ts          Disk cache (~/.cache/mtg-proxy-maker/, 24h TTL)
  render.ts         Card → HTML string templates + Playwright PDF output
  card.ts           Card type definition
  backgrounds.ts    Card frame/color resolution, file:// path generation
  mana.ts           Mana type definitions and conversions
  symbols.ts        Map of symbol keys to local SVG/PNG file paths
  paths.ts          Asset path resolution (works from both src/ and dist/)
  error.ts          CardError class

assets (not in src/):
  src/assets/images/card-symbols/    SVG/PNG mana and ability symbols
  src/assets/images/card-back.png    Default card back
  src/assets/images/flavor-text-divider.png
  public/assets/fonts/               MTG fonts (Beleren, MPlantin, Prompt)
  public/assets/images/card-frames/  SVG card frames (by type/color/legendary)
  public/assets/images/card-backgrounds/  PNG card backgrounds
  public/assets/images/planeswalker-items/  Planeswalker cost pill SVGs
```

## Deck file format

Deck files are YAML or JSON. Three modes:

**Import from Archidekt** — fetches exact printings chosen in the deck builder:
```yaml
source: https://archidekt.com/decks/12345
overrides:
  - name: "Sol Ring"
    flavorText: "One ring to rule them all"
```

**Scryfall card lookup** — by name, with optional set/language/variant:
```yaml
cards:
  - name: "Lightning Bolt"
    quantity: 4
  - name: "Counterspell"
    set: mh2
    language: fr
```

**Fully custom cards** — no Scryfall lookup:
```yaml
cards:
  - custom: true
    title: "My Card"
    manaCost: "{2}{W}"
    typeText: "Creature — Angel"
    oracleText: "Flying"
    frame: creature
```

All three can be mixed in a single file. The `overrides` array matches cards from `source` by name and can replace any field (art, flavorText, oracleText, title, manaCost, frame, etc.).

## Key implementation details

- **Rendering**: Card components are plain functions returning HTML strings (ported from Solid.js JSX). All styling is inline CSS with mm-based absolute positioning. Playwright renders the HTML to PDF via `page.pdf()`.
- **Asset loading**: HTML is written to a temp file and loaded via `file://` so Chromium can access local font and image assets. The `--allow-file-access-from-files` flag is set.
- **System Chromium**: On NixOS, Playwright's bundled Chromium won't work. The renderer auto-detects system chromium via `which`. Override with `PLAYWRIGHT_CHROMIUM_PATH` env var.
- **Caching**: All Scryfall and Archidekt API responses are cached to `~/.cache/mtg-proxy-maker/` with 24h TTL. Use `--clear-cache` to force fresh fetches.
- **Rate limiting**: Scryfall requests are rate-limited to 100ms intervals per their API policy.

## NixOS

This is a NixOS machine. Do not use apt/brew/pip. Use `nix shell nixpkgs#<pkg>` for temporary packages. A `flake.nix` is provided for the dev shell.
