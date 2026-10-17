import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const packageDir = fileURLToPath(new URL("../packages/design-tokens/", import.meta.url));
const tokens = JSON.parse(await readFile(path.join(packageDir, "tokens.json"), "utf8"));
const theme = [];
const customProperties = [];

for (const [key, value] of Object.entries(tokens.colors)) {
  theme.push(`  --color-${toKebabCase(key)}: ${value};`);
}

for (const [key, value] of Object.entries(tokens.radius)) {
  theme.push(`  --radius-${toKebabCase(key)}: ${value}px;`);
}

for (const [key, value] of Object.entries(tokens.spacing)) {
  // Keep design spacing outside Tailwind's --spacing-* namespace: Tailwind
  // also uses names such as --spacing-md for max-w-md and --spacing-sm for
  // max-w-sm. Defining those here collapses form and content widths.
  customProperties.push(`  --ds-space-${toKebabCase(key)}: ${value}px;`);
}

for (const [key, value] of Object.entries(tokens.fonts)) {
  theme.push(`  --font-${toKebabCase(key)}: ${value};`);
}

await writeFile(
  path.join(packageDir, "tokens.css"),
  `/* Generated from tokens.json by scripts/generate-design-tokens.mjs. */\n:root {\n${customProperties.join("\n")}\n}\n\n@theme {\n${theme.join("\n")}\n}\n`,
);

function toKebabCase(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
