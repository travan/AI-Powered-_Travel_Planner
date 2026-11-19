import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const mobileRequire = createRequire(
  path.join(root, "apps/mobile/package.json"),
);
const expoRequire = createRequire(mobileRequire.resolve("expo/package.json"));

describe("security dependency compatibility", () => {
  it("builds Metro asset metadata from an image file", async () => {
    const configRequire = createRequire(
      expoRequire.resolve("@expo/metro-config/package.json"),
    );
    const metroRequire = createRequire(
      configRequire.resolve("metro/package.json"),
    );
    const { getAssetData } = metroRequire("metro/src/Assets");
    const assetPath = path.join(
      path.dirname(mobileRequire.resolve("expo-router/package.json")),
      "assets/file.png",
    );

    const asset = await getAssetData(
      assetPath,
      "file.png",
      [],
      "android",
      "/assets",
    );
    expect(asset.width).toBeGreaterThan(0);
    expect(asset.height).toBeGreaterThan(0);
    expect(asset.files).toContain(assetPath);
  });

  it("reads image dimensions through Metro with the patched image-size API", () => {
    const configRequire = createRequire(
      expoRequire.resolve("@expo/metro-config/package.json"),
    );
    const metroRequire = createRequire(
      configRequire.resolve("metro/package.json"),
    );
    const { getAssetSize } = metroRequire("metro/src/Assets");
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
      "base64",
    );

    expect(getAssetSize("png", png, "pixel.png")).toEqual({
      width: 1,
      height: 1,
    });
  });

  it("keeps Expo's synchronous and asynchronous glob APIs working", async () => {
    const cliRequire = createRequire(
      expoRequire.resolve("@expo/cli/package.json"),
    );
    const { glob, globSync } = cliRequire("glob");
    const options = { cwd: path.join(root, "tests/unit/tooling") };
    const expected = ["dependency-compatibility.test.ts"];

    expect(globSync("dependency-compatibility.test.{ts,js}", options)).toEqual(
      expected,
    );
    expect(
      await glob("dependency-compatibility.test.{ts,js}", options),
    ).toEqual(expected);
  });

  it("decodes Expo Linking query parameters through its CommonJS dependency", () => {
    const linkingRequire = createRequire(
      mobileRequire.resolve("expo-linking/package.json"),
    );
    const queryString = linkingRequire("query-string");

    expect(queryString.parse("city=%C4%90%C3%A0+N%E1%BA%B5ng&bad=%FF")).toEqual(
      {
        city: "Đà Nẵng",
        bad: "%FF",
      },
    );
  });

  it("keeps UUID generation available to the CommonJS Xcode tooling", () => {
    const pluginsRequire = createRequire(
      expoRequire.resolve("@expo/config-plugins/package.json"),
    );
    const xcodeRequire = createRequire(
      pluginsRequire.resolve("xcode/package.json"),
    );
    const { v4, validate } = xcodeRequire("uuid");

    expect(validate(v4())).toBe(true);
  });
});
