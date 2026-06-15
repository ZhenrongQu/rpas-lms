import { describe, expect, it } from "vitest";
import { getHudNavState } from "./navState";

describe("getHudNavState", () => {
  it("marks services active on the localized home page when the tracks hash is selected", () => {
    expect(getHudNavState({ locale: "zh", pathname: "/zh", hash: "#tracks" })).toEqual({
      home: false,
      services: true,
      about: false,
    });
  });

  it("keeps home and about active for their own routes", () => {
    expect(getHudNavState({ locale: "en", pathname: "/en", hash: "" })).toMatchObject({
      home: true,
      services: false,
    });
    expect(getHudNavState({ locale: "en", pathname: "/en/about", hash: "#tracks" })).toMatchObject({
      services: false,
      about: true,
    });
  });
});
