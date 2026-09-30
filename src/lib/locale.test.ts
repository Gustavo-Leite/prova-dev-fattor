import { describe, expect, it } from "vitest";

import { defaultLocale, isSupportedLocale, negotiateLocale } from "@/lib/locale";

describe("negotiateLocale", () => {
  it.each([
    ["pt-BR", "pt-BR"],
    ["pt-br", "pt-BR"],
    ["pt", "pt-BR"],
    ["pt-PT", "pt-BR"],
    ["en-US", "en"],
    ["en", "en"],
  ])("maps %s to %s", (header, expected) => {
    expect(negotiateLocale(header)).toBe(expected);
  });

  it("picks the highest quality supported language", () => {
    expect(negotiateLocale("en;q=0.5, pt-BR;q=0.9")).toBe("pt-BR");
  });

  it("keeps header order when qualities are equal", () => {
    expect(negotiateLocale("en-US, pt-BR")).toBe("en");
  });

  it("skips unsupported languages until a supported one appears", () => {
    expect(negotiateLocale("fr-FR, de;q=0.9, pt;q=0.8")).toBe("pt-BR");
  });

  it("ignores languages the user explicitly refused", () => {
    expect(negotiateLocale("pt-BR;q=0, en;q=0.5")).toBe("en");
  });

  it("treats a malformed quality as refused", () => {
    expect(negotiateLocale("pt-BR;q=abc, en;q=0.1")).toBe("en");
  });

  it("reads the quality parameter name case-insensitively", () => {
    expect(negotiateLocale("en;q=0.9, pt;Q=0.1")).toBe("en");
  });

  it.each(["q=1.5", "q=0x1", "q=1e0", "q=-0.5", "q=0.1234"])(
    "treats an out-of-spec quality (%s) as refused",
    (quality) => {
      expect(negotiateLocale(`pt-BR;${quality}, en;q=0.1`)).toBe("en");
    },
  );

  it("falls back to the default when every language is refused", () => {
    expect(negotiateLocale("pt-BR;q=0, en;q=0")).toBe(defaultLocale);
  });

  it("treats an empty quality as refused", () => {
    expect(negotiateLocale("pt-BR;q=, en;q=0.1")).toBe("en");
  });

  it("tolerates extra whitespace and parameters", () => {
    expect(negotiateLocale("  fr ;q=0.9 ,  pt-BR ; q=0.8 ")).toBe("pt-BR");
  });

  it.each([null, undefined, "", "*", "fr-FR, de"])(
    "falls back to the default locale for %j",
    (header) => {
      expect(negotiateLocale(header)).toBe(defaultLocale);
    },
  );
});

describe("isSupportedLocale", () => {
  it("accepts supported locales exactly", () => {
    expect(isSupportedLocale("pt-BR")).toBe(true);
    expect(isSupportedLocale("en")).toBe(true);
  });

  it.each([undefined, "", "pt", "pt-br", "fr"])("rejects %j", (value) => {
    expect(isSupportedLocale(value)).toBe(false);
  });
});
