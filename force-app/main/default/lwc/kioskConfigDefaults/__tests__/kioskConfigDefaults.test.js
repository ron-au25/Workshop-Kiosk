import { defaults, mergeConfig } from "c/kioskConfigDefaults";

describe("mergeConfig", () => {
  test("empty / bad input gives defaults", () => {
    expect(mergeConfig("{}")).toEqual(defaults());
    expect(mergeConfig("not json")).toEqual(defaults());
    expect(mergeConfig(null)).toEqual(defaults());
    expect(mergeConfig([1])).toEqual(defaults());
  });
  test("valid overrides apply", () => {
    const c = mergeConfig(
      JSON.stringify({
        wpProgress: "off",
        wpView: "board",
        wtFilter: false,
        woTile: ["Status"],
        assetDrawer: { Name: "E" }
      })
    );
    expect(c.wpProgress).toBe("off");
    expect(c.wpView).toBe("board");
    expect(c.wtFilter).toBe(false);
    expect(c.woTile).toEqual(["Status"]);
    expect(c.assetDrawer).toEqual({ Name: "E" });
    expect(c.wpRings).toEqual(defaults().wpRings);
  });
  test("invalid values fall back per key", () => {
    const c = mergeConfig({
      wpProgress: "bogus",
      wpNext: "yes",
      assetTile: [1, 2],
      assetDrawer: { Name: "X", Status: "R" }
    });
    expect(c.wpProgress).toBe("open");
    expect(c.wpNext).toBe(true);
    expect(c.assetTile).toEqual(defaults().assetTile);
    expect(c.assetDrawer).toEqual({ Status: "R" });
  });
  test("defaults are fresh copies", () => {
    const a = defaults();
    a.wpRings.pop();
    expect(defaults().wpRings.length).toBe(6);
  });
});
