import { execSync } from "node:child_process";
import path from "node:path";
import { chromium } from "playwright";
import { getFrameAndBackgroundFromAspect } from "./backgrounds.js";
import type { Card } from "./card.js";
import { type ManaType, manaTypeToSvg, manaTypes, customManaTypes } from "./mana.js";
import { ASSETS, fileUrl } from "./paths.js";
import { symbols } from "./symbols.js";

function findSystemChromium(): string | undefined {
  for (const name of [
    "chromium",
    "chromium-browser",
    "google-chrome-stable",
    "google-chrome",
  ]) {
    try {
      const result = execSync(`which ${name}`, { encoding: "utf-8" }).trim();
      if (result) return result;
    } catch {
      // not found, try next
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// HTML string helpers
// ---------------------------------------------------------------------------

function css(styles: Record<string, string | number | undefined>): string {
  return Object.entries(styles)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => {
      const prop = k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      return `${prop}:${v}`;
    })
    .join(";");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Symbol injection (replaces {W}, {T}, etc. with <img> tags)
// ---------------------------------------------------------------------------

function injectSymbols(text: string): string {
  return text
    .split(/(\{[^}]+\})/g)
    .map((part) => {
      const match = part.match(/^\{(.+)\}$/);
      if (match && match[1] in symbols) {
        const key = match[1];
        return `<img style="${css({
          width: "2.5mm",
          transform: "translateY(2px)",
          margin: "0 0.1mm",
          display: "initial",
          verticalAlign: "initial",
        })}" src="${fileUrl(symbols[key])}" />`;
      }
      return escapeHtml(part);
    })
    .join("");
}

// ---------------------------------------------------------------------------
// Card sub-components as HTML string functions
// ---------------------------------------------------------------------------

function renderManaIcon(src: string, name: ManaType): string {
  const isCustom = (customManaTypes as readonly string[]).includes(name);
  return `<img style="${css({
    width: "3mm",
    height: "3mm",
    marginLeft: "0.3mm",
    marginBottom: "0.8mm",
    borderRadius: isCustom ? "0" : "100%",
    boxShadow: isCustom ? "" : "-0.5px 1px 0px black",
  })}" src="${fileUrl(src)}" />`;
}

function renderTitleBar(
  title: string,
  manaCost: ManaType[],
  category: Card["category"],
): string {
  const posStyles =
    category === "Planeswalker"
      ? { top: "3mm", height: "4.4mm", left: "4.5mm", right: "4.6mm" }
      : { top: "4.5mm", height: "4.9mm", left: "4.7mm", right: "4.6mm" };

  const sorted = [...manaCost].sort(
    (a, b) =>
      manaTypes.indexOf(a as any) - manaTypes.indexOf(b as any),
  );
  const colorless = sorted.filter((m) => m === "colorless");
  const colored = sorted.filter((m) => m !== "colorless");

  const chars = title.length + colored.length * 2 + (colorless.length > 0 ? 2 : 0);

  let manaHtml = "";
  if (manaCost.length > 0) {
    let icons = "";
    if (colorless.length > 0 && String(colorless.length) in symbols) {
      icons += renderManaIcon(
        symbols[String(colorless.length)],
        "colorless",
      );
    }
    for (const mana of colored) {
      icons += renderManaIcon(manaTypeToSvg[mana], mana);
    }
    manaHtml = `<div style="${css({
      display: "flex",
      alignItems: "center",
    })}">${icons}</div>`;
  }

  return `<div style="${css({
    display: "flex",
    justifyContent: "space-around",
    position: "absolute",
    fontFamily: "Beleren",
    whiteSpace: "nowrap",
    zIndex: "2",
    ...posStyles,
  })}">
    <h1 style="${css({
      margin: "0",
      marginTop: "auto",
      marginBottom: "auto",
      marginLeft: "0.5mm",
      "--chars": String(chars),
      fontSize: "clamp(7pt, (200px) / var(--chars)*2, 10pt)",
      flex: "1",
    })}">${escapeHtml(title)}</h1>
    ${manaHtml}
  </div>`;
}

function renderTypeBar(type: string, category: Card["category"]): string {
  const posStyles =
    category === "Planeswalker"
      ? {
          top: "49.4mm",
          left: "4.7mm",
          right: "4.6mm",
          height: "4.3mm",
          position: "absolute",
        }
      : {
          top: "49.6mm",
          left: "4.7mm",
          right: "4.6mm",
          height: "5mm",
        };

  return `<div style="${css({
    display: "flex",
    alignItems: "center",
    position: "absolute",
    zIndex: "2",
    ...posStyles,
  })}">
    <h1 style="${css({
      margin: "0",
      marginLeft: "0.5mm",
      fontFamily: "Beleren",
      "--rows": String(type.length),
      fontSize: "clamp(6pt, (200px) / var(--rows) * 2, 9pt)",
      flex: "1",
    })}">${escapeHtml(type)}</h1>
  </div>`;
}

function renderArt(url: string, category: Card["category"]): string {
  const styles =
    category === "Planeswalker"
      ? {
          width: "53.7mm",
          height: "40.1mm",
          position: "absolute",
          top: "8.3mm",
          left: "4.7mm",
          objectFit: "cover",
        }
      : {
          width: "53.4mm",
          height: "38.8mm",
          position: "absolute",
          top: "10.3mm",
          left: "4.9mm",
          objectFit: "cover",
        };

  return `<img style="${css(styles)}" src="${escapeHtml(url)}" />`;
}

function renderRegularDescription(
  oracle: string | undefined,
  flavor: string | undefined,
): string {
  const totalText = (oracle ?? "") + (flavor ?? "");
  const totalLength = totalText.length;
  const paragraphs = totalText.split("\n").length - 1;
  const divider = flavor && oracle ? 1 : 0;

  let oracleHtml = "";
  if (oracle) {
    const paragraphsHtml = oracle
      .split("\n")
      .map(
        (p, i) =>
          `<p style="${css({
            margin: "0",
            marginTop: i > 0 ? "1mm" : "0",
          })}">${injectSymbols(p)}</p>`,
      )
      .join("");

    oracleHtml = `<div style="${css({
      margin: "0",
      fontWeight: "500",
      display: "flex",
      flexDirection: "column",
      whiteSpace: "pre-wrap",
    })}">${paragraphsHtml}</div>`;
  }

  let dividerHtml = "";
  if (flavor && oracle) {
    dividerHtml = `<img src="${fileUrl(ASSETS.flavorTextDivider)}" style="${css({
      marginTop: "1mm",
      marginBottom: "1mm",
    })}" />`;
  }

  let flavorHtml = "";
  if (flavor) {
    flavorHtml = `<p style="${css({
      margin: "0",
      fontStyle: "italic",
      whiteSpace: "pre-wrap",
    })}">${escapeHtml(flavor)}</p>`;
  }

  return `<div style="${css({
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    top: "55.1mm",
    height: "24.5mm",
    left: "4.9mm",
    right: "4.7mm",
    position: "absolute",
    "--rows": String(totalLength / 27 + paragraphs * 0.5 + divider * 1),
    fontSize: "clamp(6.5pt, 92.6px / var(--rows) * 1.2, 9.5pt)",
    padding: "1mm",
    fontFamily: "MPlantin",
    lineHeight: "0.9",
  })}">${oracleHtml}${dividerHtml}${flavorHtml}</div>`;
}

function renderPlaneswalkerCost(cost: string): string {
  const first = cost[0];
  let src: string;
  let extraStyle: Record<string, string>;

  if (first === "-") {
    src = fileUrl(
      path.join(ASSETS.planeswalkerItemsDir, "Minus.svg"),
    );
    extraStyle = { marginTop: "0.5mm" };
  } else if (first === "+") {
    src = fileUrl(
      path.join(ASSETS.planeswalkerItemsDir, "Plus.svg"),
    );
    extraStyle = { marginTop: "1mm" };
  } else {
    src = fileUrl(
      path.join(ASSETS.planeswalkerItemsDir, "Zero.svg"),
    );
    extraStyle = { marginTop: "0.5mm" };
  }

  return `<div style="${css({
    zIndex: "10",
    display: "grid",
    gridTemplateColumns: "1fr",
    gridTemplateRows: "1fr",
    marginTop: "auto",
    marginBottom: "auto",
    height: "4mm",
    fontSize: "7pt",
    fontWeight: "500",
    marginLeft: "-2.9mm",
  })}">
    <span style="${css({
      gridColumnStart: "1",
      gridRowStart: "1",
      color: "white",
      zIndex: "10",
      textAlign: "center",
      marginLeft: "2.5mm",
      ...extraStyle,
    })}">${escapeHtml(cost)}</span>
    <img src="${src}" alt=""
      style="${css({
        maxWidth: "none",
        gridColumnStart: "1",
        gridRowStart: "1",
        width: "9mm",
        marginTop: "-1mm",
      })}" />
  </div>`;
}

function renderPlaneswalkerDescription(oracle: string): string {
  const maxLength = oracle
    .split("\n")
    .reduce((a, b) => Math.max(a, b.length), 0);

  let fontSize: string;
  if (maxLength < 50) fontSize = "7pt";
  else if (maxLength < 100) fontSize = "6.5pt";
  else if (maxLength < 150) fontSize = "5.8pt";
  else if (maxLength < 200) fontSize = "5.5pt";
  else if (maxLength < 250) fontSize = "5.3pt";
  else fontSize = "5pt";

  const lines = oracle.split("\n");
  const rows = lines.map((line, i) => {
    const splitted = line.replace("−", "-").split(/([\+\-]?\d+)+\s?:\s?/g);
    const bgColor =
      i % 2 === 0
        ? "rgba(249,250,251,0.7)"
        : "rgba(229,231,235,0.7)";
    const isLast = i === lines.length - 1;

    if (splitted.length > 1) {
      return `${renderPlaneswalkerCost(splitted[1])}
        <p style="${css({
          margin: "0",
          paddingLeft: "0.625rem",
          paddingRight: "0.25rem",
          paddingBottom: isLast ? "0.25rem" : undefined,
          display: "flex",
          alignItems: "center",
          backgroundColor: bgColor,
          fontSize,
        })}">${injectSymbols(splitted[2] ?? "")}</p>`;
    } else {
      return `<div></div>
        <p style="${css({
          margin: "0",
          paddingLeft: "0.25rem",
          paddingRight: "0.25rem",
          paddingBottom: isLast ? "0.25rem" : undefined,
          display: "flex",
          alignItems: "center",
          backgroundColor: bgColor,
          fontSize,
        })}">${injectSymbols(splitted[0])}</p>`;
    }
  });

  return `<div style="${css({
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    top: "54mm",
    height: "27.1mm",
    left: "2.9mm",
    right: "4.2mm",
    position: "absolute",
    fontSize: "6pt",
    padding: "0.8mm",
    fontFamily: "MPlantin",
    lineHeight: "1",
  })}">
    <div style="${css({
      display: "grid",
      gridTemplateColumns: "3.9mm 1fr",
      gridAutoRows: "1fr",
      alignItems: "center",
      height: "100%",
    })}">${rows.join("")}</div>
  </div>`;
}

function renderPlaneswalkerLoyalty(value: string): string {
  return `<div style="${css({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    bottom: "5.1mm",
    right: "4.3mm",
    height: "4.2mm",
    width: "7mm",
    position: "absolute",
    fontFamily: "Beleren",
    fontSize: "9.5pt",
    zIndex: "2",
    color: "white",
  })}">
    <span style="${css({ marginTop: "0.7mm" })}">${escapeHtml(value)}</span>
  </div>`;
}

function renderStrength(
  power: string | undefined,
  toughness: string | undefined,
  textColor: string,
): string {
  const p = power ?? "";
  const t = toughness ?? "";
  const separator = p && t ? "/" : "";

  return `<div style="${css({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    bottom: "5.2mm",
    right: "4.3mm",
    height: "4.2mm",
    width: "8.6mm",
    position: "absolute",
    fontFamily: "Beleren",
    fontSize: "10pt",
    zIndex: "2",
    color: textColor,
  })}">
    <span style="${css({ marginTop: "0.5mm" })}">${escapeHtml(p)}${separator}${escapeHtml(t)}</span>
  </div>`;
}

function renderMetadata(card: Card): string {
  const collector = card.collectorNumber ?? "";
  const rarityChar = card.rarity?.[0]?.toUpperCase() ?? "";
  const setStr = card.set?.toUpperCase() ?? "";
  const langStr = card.lang?.toUpperCase() ?? "";
  const artist = card.artist ?? "";
  const year = new Date().getFullYear();

  let setLangHtml = "";
  if (setStr) setLangHtml += `<span>${escapeHtml(setStr)}</span>`;
  if (setStr && langStr)
    setLangHtml += `<span style="margin:0 5px">&middot;</span>`;
  if (langStr) setLangHtml += `<span>${escapeHtml(langStr)}</span>`;
  if (artist)
    setLangHtml += `<span style="${css({
      marginLeft: "1mm",
      fontFamily: "Beleren Small Caps",
    })}">${escapeHtml(artist)}</span>`;

  return `<div style="${css({
    display: "flex",
    flexDirection: "column",
    bottom: "1.7mm",
    height: "4mm",
    left: "4.3mm",
    right: "4.2mm",
    position: "absolute",
    color: "white",
    fontFamily: "Prompt",
    fontSize: "4.5pt",
    lineHeight: "1",
    zIndex: "2",
  })}">
    <div style="${css({ display: "flex", flex: "1" })}">${escapeHtml(collector)} ${escapeHtml(rarityChar)} &middot; Proxy</div>
    <div style="${css({ flex: "1", display: "flex", width: "100%" })}">
      <div style="${css({ flex: "1", display: "flex" })}">${setLangHtml}</div>
      <div style="${css({
        flex: "1",
        display: "flex",
        justifyContent: "flex-end",
        fontFamily: "serif",
        fontSize: "4.4pt",
      })}">&#8482;&amp;&#169; ${year} Wizards of the Coast</div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Main card rendering
// ---------------------------------------------------------------------------

export function renderCard(card: Card): string {
  if (card.overrideWithScanUrl) {
    return `<div style="${css({
      position: "relative",
      display: "flex",
      fontFamily: "MPlantin",
      fontSize: "12pt",
      backgroundColor: "var(--card-bgc, #161410)",
      height: "auto",
      width: "var(--card-width)",
      minWidth: "var(--card-width)",
      maxWidth: "var(--card-width)",
      aspectRatio: "63/88",
      border: "var(--card-bleed) solid var(--card-bgc)",
      margin: "auto",
      boxSizing: "content-box",
    })}">
      <img style="width:100%;height:100%;border-radius:0" src="${escapeHtml(card.overrideWithScanUrl)}" alt="${escapeHtml(card.title)}" />
    </div>`;
  }

  const fb = getFrameAndBackgroundFromAspect(card.aspect);

  let descriptionHtml = "";
  if (card.category === "Regular") {
    if (card.aspect.frame !== "Basic Land") {
      descriptionHtml = renderRegularDescription(
        card.oracleText,
        card.flavorText,
      );
    }
  } else {
    descriptionHtml = renderPlaneswalkerDescription(card.oracleText);
  }

  let bottomHtml = "";
  if (card.category === "Regular") {
    if (card.power || card.toughness) {
      const textColor =
        card.aspect.frame === "Vehicle" ? "white" : "black";
      bottomHtml = renderStrength(card.power, card.toughness, textColor);
    }
  } else {
    bottomHtml = renderPlaneswalkerLoyalty(card.loyalty ?? "");
  }

  return `<div style="${css({
    position: "relative",
    display: "flex",
    fontFamily: "MPlantin",
    fontSize: "12pt",
    backgroundColor: "var(--card-bgc, #161410)",
    height: "auto",
    width: "var(--card-width)",
    minWidth: "var(--card-width)",
    maxWidth: "var(--card-width)",
    aspectRatio: "63/88",
    border: "var(--card-bleed) solid var(--card-bgc)",
    margin: "auto",
    boxSizing: "content-box",
  })}">
    <img style="${css({
      width: "100%",
      height: "100%",
      position: "absolute",
      top: "0",
      left: "0",
    })}" src="${escapeHtml(fb.background)}" />
    <div style="${css({
      bottom: "5.5mm",
      height: "2mm",
      left: "0",
      right: "0",
      position: "absolute",
      background: "var(--card-bgc, black)",
    })}"></div>
    ${card.artUrl ? renderArt(card.artUrl, card.category) : ""}
    <img style="${css({
      width: "100%",
      height: "100%",
      position: "absolute",
      top: "0",
      left: "0",
      zIndex: card.category === "Planeswalker" ? "1" : "0",
    })}" src="${escapeHtml(fb.frame)}" />
    ${renderTitleBar(card.title, card.manaCost, card.category)}
    ${renderTypeBar(card.typeText, card.category)}
    ${descriptionHtml}
    ${bottomHtml}
    ${renderMetadata(card)}
  </div>`;
}

function renderCardVerso(
  verso: Card["verso"],
  cardBackUrl: string,
): string {
  if (!verso) {
    // Empty placeholder
    return `<div style="${css({
      position: "relative",
      height: "auto",
      display: "flex",
      width: "var(--card-width)",
      minWidth: "var(--card-width)",
      maxWidth: "var(--card-width)",
      aspectRatio: "63/88",
      border: "var(--card-bleed) solid transparent",
      margin: "auto",
      boxSizing: "content-box",
    })}"></div>`;
  }

  if (verso === "default") {
    return renderCardVerso(cardBackUrl, cardBackUrl);
  }

  if (typeof verso === "string") {
    const src = verso.startsWith("/") || verso.startsWith("file://")
      ? verso
      : verso;
    return `<img style="${css({
      position: "relative",
      backgroundColor: "var(--card-bgc, #161410)",
      height: "auto",
      display: "flex",
      width: "var(--card-width)",
      minWidth: "var(--card-width)",
      maxWidth: "var(--card-width)",
      aspectRatio: "63/88",
      border: "var(--card-bleed) solid var(--card-bgc)",
      margin: "auto",
      boxSizing: "content-box",
    })}" src="${escapeHtml(src)}" alt="" />`;
  }

  // verso is a Card
  return renderCard(verso);
}

// ---------------------------------------------------------------------------
// Full page HTML generation
// ---------------------------------------------------------------------------

function buildFullHtml(cards: Card[], printVersos: boolean): string {
  const fontsDir = ASSETS.fontsDir;
  const cardBackUrl = fileUrl(ASSETS.cardBack);

  const fontFaces = `
    @font-face {
      font-family: "Beleren Small Caps";
      src: url("${fileUrl(path.join(fontsDir, "Beleren Small Caps.ttf"))}");
    }
    @font-face {
      font-family: "Beleren";
      font-weight: bold;
      src: url("${fileUrl(path.join(fontsDir, "Beleren-Bold.ttf"))}");
    }
    @font-face {
      font-family: "MPlantin";
      font-weight: bold;
      src: url("${fileUrl(path.join(fontsDir, "MPlantin-Bold.ttf"))}");
    }
    @font-face {
      font-family: "MPlantin";
      font-style: italic;
      src: url("${fileUrl(path.join(fontsDir, "MPlantin Italic.ttf"))}");
    }
    @font-face {
      font-family: "MPlantin";
      src: url("${fileUrl(path.join(fontsDir, "Mplantin.woff"))}");
    }
    @font-face {
      font-family: "Prompt";
      font-weight: 100;
      src: url("${fileUrl(path.join(fontsDir, "Prompt-ExtraLight.ttf"))}");
    }
  `;

  const pageStyles = `
    :root {
      --card-width: 63mm;
      --card-bleed: 1mm;
      --card-margin: 1mm;
      --page-width: 21cm;
      --page-height: 29.7cm;
      --page-padding: 0.55cm;
      --card-bgc: #161410;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: var(--page-width);
      background: white;
    }
    .page {
      width: var(--page-width);
      min-height: var(--page-height);
      display: grid;
      place-content: center;
      page-break-after: always;
    }
    .page:last-child {
      page-break-after: auto;
    }
    .card-grid {
      display: grid;
      width: fit-content;
      height: fit-content;
      grid-template-columns: repeat(3, 1fr);
      grid-template-rows: repeat(3, auto);
      grid-gap: var(--card-margin);
    }
  `;

  // Chunk cards into pages of 9
  const pages: string[] = [];
  for (let i = 0; i < cards.length; i += 9) {
    const pageCards = cards.slice(i, i + 9);
    const cardHtmls = pageCards.map((c) => renderCard(c)).join("\n");
    pages.push(`<div class="page"><div class="card-grid">${cardHtmls}</div></div>`);

    if (printVersos) {
      // Verso page: cards in reverse row order for double-sided printing
      const versoHtmls: string[] = [];
      for (let row = 0; row < 3; row++) {
        for (let col = 2; col >= 0; col--) {
          const idx = row * 3 + col;
          const card = pageCards[idx];
          if (card) {
            versoHtmls.push(
              renderCardVerso(card.verso, cardBackUrl),
            );
          } else {
            versoHtmls.push(
              renderCardVerso(undefined, cardBackUrl),
            );
          }
        }
      }
      pages.push(`<div class="page"><div class="card-grid">${versoHtmls.join("\n")}</div></div>`);
    }
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>${fontFaces}${pageStyles}</style>
</head>
<body>${pages.join("\n")}</body>
</html>`;
}

// ---------------------------------------------------------------------------
// PDF rendering with Playwright
// ---------------------------------------------------------------------------

export interface RenderOptions {
  cards: Card[];
  outputPath: string;
  printVersos: boolean;
  verbose: boolean;
}

export async function renderPdf(options: RenderOptions): Promise<void> {
  const { cards, outputPath, printVersos, verbose } = options;

  if (verbose) {
    process.stderr.write(`Generating HTML for ${cards.length} cards...\n`);
  }

  const html = buildFullHtml(cards, printVersos);

  // Write HTML to a temp file so Playwright loads it with a file:// origin,
  // which allows it to access local font/image assets via file:// URLs.
  const tmpHtmlPath = path.join(
    (await import("node:os")).tmpdir(),
    `mtg-proxy-${Date.now()}.html`,
  );
  const fs = await import("node:fs");
  fs.writeFileSync(tmpHtmlPath, html, "utf-8");

  if (verbose) {
    process.stderr.write("Launching browser...\n");
  }

  // On NixOS, Playwright's bundled Chromium won't work. Use system chromium.
  // Set PLAYWRIGHT_CHROMIUM_PATH env var to override, or fall back to system PATH.
  const executablePath =
    process.env["PLAYWRIGHT_CHROMIUM_PATH"] ??
    findSystemChromium();

  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ["--allow-file-access-from-files", "--no-sandbox"],
  });
  const page = await browser.newPage();

  await page.goto(`file://${tmpHtmlPath}`, { waitUntil: "networkidle" });

  // Wait for all images (card art from Scryfall, local assets) to load
  await page.waitForFunction(`
    (() => {
      const imgs = document.querySelectorAll("img");
      return Array.from(imgs).every(img => img.complete && img.naturalHeight > 0);
    })()
  `, { timeout: 60000 }).catch(() => {
    // Some images might 404 (missing art etc.), proceed anyway
    if (verbose) {
      process.stderr.write(
        "Warning: some images may not have loaded\n",
      );
    }
  });

  if (verbose) {
    const pageCount = Math.ceil(cards.length / 9) * (printVersos ? 2 : 1);
    process.stderr.write(`Rendering ${pageCount} pages to PDF...\n`);
  }

  await page.pdf({
    path: outputPath,
    format: "A4",
    printBackground: true,
    margin: { top: "0", bottom: "0", left: "0", right: "0" },
  });

  await browser.close();

  // Clean up temp HTML file
  try {
    fs.unlinkSync(tmpHtmlPath);
  } catch {
    // ignore cleanup errors
  }

  if (verbose) {
    process.stderr.write(`Done: ${outputPath}\n`);
  }
}
