import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Works from both src/ (tsx dev) and dist/ (built bundle)
export const PROJECT_ROOT = path.resolve(__dirname, "..");

export const ASSETS = {
  symbolsDir: path.join(PROJECT_ROOT, "src/assets/images/card-symbols"),
  fontsDir: path.join(PROJECT_ROOT, "public/assets/fonts"),
  framesDir: path.join(PROJECT_ROOT, "public/assets/images/card-frames"),
  backgroundsDir: path.join(
    PROJECT_ROOT,
    "public/assets/images/card-backgrounds",
  ),
  planeswalkerItemsDir: path.join(
    PROJECT_ROOT,
    "public/assets/images/planeswalker-items",
  ),
  flavorTextDivider: path.join(
    PROJECT_ROOT,
    "src/assets/images/flavor-text-divider.png",
  ),
  cardBack: path.join(PROJECT_ROOT, "src/assets/images/card-back.png"),
};

export function fileUrl(absolutePath: string): string {
  return `file://${absolutePath}`;
}
