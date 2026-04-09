# MTG Proxy Maker

Declarative CLI that generates print-ready MTG proxy card PDFs from YAML/JSON deck files. Cards are rendered at high resolution using vector frames, custom MTG fonts, and Scryfall card data — no scan quality dependency.

## Features

- **Import from Archidekt** — paste a deck URL, get exact printings
- **Scryfall lookup** — fetch any card by name, set, language, or art variant
- **Custom cards** — define cards from scratch with your own art and text
- **Override anything** — swap art, flavor text, oracle text on imported cards
- **Print-ready output** — A4 PDF with 3x3 card grid, proper margins and bleeds
- **Double-sided printing** — optional verso pages with card backs
- **Multi-language** — supports all Scryfall languages
- **Caching** — API responses cached to disk (24h), re-runs are near-instant

## Quick start

```bash
pnpm install
```

Create a deck file (e.g. `my-deck/deck.yaml`):

```yaml
source: https://archidekt.com/decks/21196197/gogo_is_an_eldrazi

overrides:
  - name: "Sol Ring"
    flavorText: "One ring to rule them all"
  - name: "Lightning Greaves"
    art: "https://example.com/custom-greaves.png"
```

Generate the PDF:

```bash
pnpm tsx src/index.ts my-deck -o proxies.pdf --verbose
```

## Deck file format

Deck files are YAML (or JSON). Place one or more in a folder and point the CLI at it.

### Import from Archidekt

Fetches the full deck list with exact printings chosen in the deck builder:

```yaml
source: https://archidekt.com/decks/12345

overrides:
  - name: "Counterspell"
    flavorText: "No."
```

### Scryfall card lookup

```yaml
language: en

cards:
  - name: "Lightning Bolt"
    quantity: 4

  - name: "Wrath of God"
    language: fr

  - name: "Counterspell"
    set: mh2

  - name: "Island"
    quantity: 2
    variant: 5

  - name: "Sol Ring"
    overrides:
      flavorText: "Custom flavor text"
      art: "https://example.com/art.png"
```

### Fully custom cards

```yaml
cards:
  - custom: true
    title: "My Custom Card"
    manaCost: "{2}{W}{B}"
    art: "./art/my-card.png"
    typeText: "Creature — Angel"
    oracleText: "Flying, lifelink"
    flavorText: "Custom flavor"
    power: "4"
    toughness: "4"
    frame: creature
    legendary: true
```

All three modes can be mixed in a single file.

### Override fields

These fields can be overridden on any card (both Archidekt imports and Scryfall lookups):

| Field | Description |
|-------|-------------|
| `title` | Card name |
| `art` | Art image URL |
| `oracleText` | Rules text |
| `flavorText` | Flavor text |
| `manaCost` | Mana cost string (e.g. `{2}{W}{U}`) |
| `typeText` | Type line |
| `power` | Power |
| `toughness` | Toughness |
| `artist` | Artist name |
| `frame` | Frame type: `creature`, `noncreature`, `planeswalker`, `basic-land`, `nonbasic-land`, `vehicle` |
| `legendary` | Legendary border (true/false) |

## CLI options

```
pnpm tsx src/index.ts <input-dir> [options]

Options:
  -o, --output <path>     Output PDF path (default: proxies.pdf)
  -l, --language <lang>   Default language (default: en)
  --versos                Include card back pages for double-sided printing
  --verbose               Show progress information
  --clear-cache           Clear API cache before running
  -V, --version           Show version
  -h, --help              Show help
```

## NixOS

A `flake.nix` is included. It provides Node.js and Chromium (required by Playwright for PDF rendering):

```bash
nix develop
```

On non-NixOS systems, install Playwright's Chromium:

```bash
npx playwright install chromium
```

## How it works

Cards are rendered as HTML with inline CSS (mm-based absolute positioning, custom MTG fonts, layered SVG frames and PNG backgrounds). Playwright's headless Chromium renders the HTML to a print-ready PDF. This approach preserves the pixel-perfect layout from the original webapp without reimplementing rendering in a PDF library.

## Credits

Originally created by [Quentin Widlocher](https://quentin.widlocher.com) as a Solid.js webapp. Card data from [Scryfall](https://scryfall.com). Deck imports from [Archidekt](https://archidekt.com).
