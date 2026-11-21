import {
  isSystemActivityName,
  type Activity,
  type Itinerary,
} from "@travel/types";
/** Mask names, links and numeric tokens even when embedded in descriptive prose. */
export function protectTranslationText(
  plan: Itinerary,
  texts: Record<string, string>,
) {
  const names = new Set<string>();
  const collect = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    for (const [key, v] of Object.entries(value)) {
      if (
        typeof v === "string" &&
        /^(name|city|from|to|address|provider|booking_reference)$/.test(key) &&
        !(key === "name" && isSystemActivityName(value as Activity)) &&
        v.trim()
      )
        names.add(v);
      else if (typeof v === "object") collect(v);
    }
  };
  collect(plan);
  // Journey labels may be user-entered names, whereas budget labels are descriptive text.
  for (const location of [
    plan.planning?.journey.origin,
    plan.planning?.journey.endpoint,
  ])
    if (location?.label) names.add(location.label);
  const escaped = [...names]
    .sort((a, b) => b.length - a.length)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(
    [...escaped, "https?:\\/\\/[^\\s]+", "\\d+(?:[.,:/–-]\\d+)*"].join("|"),
    "gu",
  );
  const protectedTexts: Record<string, string> = {},
    replacements: Record<string, string[]> = {};
  for (const [key, text] of Object.entries(texts)) {
    if (text.includes("__KEEP_")) throw new Error("TRANSLATION_RESERVED_TOKEN");
    replacements[key] = [];
    protectedTexts[key] = text.replace(pattern, (part) => {
      const i = replacements[key]!.push(part) - 1;
      return `__KEEP_${i}__`;
    });
  }
  return {
    texts: protectedTexts,
    restore(output: Record<string, string>) {
      if (
        !output ||
        typeof output !== "object" ||
        Array.isArray(output) ||
        Object.keys(output).length !== Object.keys(texts).length
      )
        throw new Error("TRANSLATION_INVALID_KEYS");
      const restored: Record<string, string> = {};
      for (const key of Object.keys(texts)) {
        const translated = output[key];
        if (
          typeof translated !== "string" ||
          !translated.trim() ||
          translated.length > 12000
        )
          throw new Error("TRANSLATION_INVALID_TEXT");
        const tokens: string[] = translated.match(/__KEEP_\d+__/g) ?? [];
        if (
          tokens.length !== replacements[key]!.length ||
          new Set(tokens).size !== tokens.length ||
          /\d/.test(translated.replace(/__KEEP_\d+__/g, ""))
        )
          throw new Error("TRANSLATION_CHANGED_INVARIANTS");
        for (let i = 0; i < tokens.length; i++)
          if (!tokens.includes(`__KEEP_${i}__`))
            throw new Error("TRANSLATION_CHANGED_INVARIANTS");
        restored[key] = translated.replace(
          /__KEEP_(\d+)__/g,
          (_, i) => replacements[key]![Number(i)]!,
        );
      }
      return restored;
    },
  };
}
