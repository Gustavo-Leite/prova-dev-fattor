import { describe, expect, it } from "vitest";

import { isTheme } from "@/lib/theme";

describe("isTheme", () => {
  it.each(["light", "dark"])("accepts %s", (value) => {
    expect(isTheme(value)).toBe(true);
  });

  it.each([undefined, "", "system", "Dark", "dark ", "blue"])("rejects %s", (value) => {
    expect(isTheme(value)).toBe(false);
  });
});
