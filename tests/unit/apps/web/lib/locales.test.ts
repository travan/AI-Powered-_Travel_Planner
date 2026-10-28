import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "../../../../../apps/web/messages/en.json";
import vi from "../../../../../apps/web/messages/vi.json";
function flatten(value: object, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, value]) =>
      typeof value === "string"
        ? [[prefix + key, value]]
        : Object.entries(flatten(value, prefix + key + ".")),
    ),
  );
}
describe("English/Vietnamese catalogs", () => {
  it("has matching keys and interpolation arguments", () => {
    const english = flatten(en),
      vietnamese = flatten(vi);
    expect(Object.keys(english).sort()).toEqual(Object.keys(vietnamese).sort());
    const params = (text: string) =>
      [
        ...new Set(
          [...text.matchAll(/\{([a-zA-Z_]\w*)\s*[,}]/g)].map(
            (match) => match[1],
          ),
        ),
      ].sort();
    for (const key of Object.keys(english))
      expect(params(english[key]!), key).toEqual(params(vietnamese[key]!));
  });
  it("translates every planning issue code", () => {
    const source = readFileSync(
      new URL("../../../../../packages/types/src/journey.ts", import.meta.url),
      "utf8",
    );
    const codes = [
      ...source.matchAll(/(?:code:\s*|issue\(\s*)"([A-Z_]+)"/g),
    ].map((match) => match[1]);
    for (const code of codes)
      expect(Object.hasOwn(en.issues, code!), code).toBe(true);
  });
});
