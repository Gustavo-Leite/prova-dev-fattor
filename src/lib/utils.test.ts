import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("keeps the last of two conflicting status text colors", () => {
    expect(cn("text-status-authorized", "text-status-rejected")).toBe("text-status-rejected");
  });

  it("keeps a font size next to a status text color", () => {
    expect(cn("text-sm", "text-status-denied")).toBe("text-sm text-status-denied");
  });

  it("resolves a tinted status background against a later background", () => {
    expect(cn("bg-status-authorized/12", "bg-muted")).toBe("bg-muted");
  });

  it("resolves brand text color against a semantic text color", () => {
    expect(cn("text-brand-gold-text", "text-foreground")).toBe("text-foreground");
  });

  it("lets a shorthand padding override earlier axis paddings", () => {
    expect(cn("px-2 py-1", "p-4")).toBe("p-4");
  });

  it("keeps an axis padding that refines an earlier shorthand", () => {
    expect(cn("p-4", "px-2")).toBe("p-4 px-2");
  });

  it("drops falsy values and disabled conditional classes", () => {
    expect(cn("px-3", false, null, undefined, { "py-2": false, "font-mono": true })).toBe(
      "px-3 font-mono",
    );
  });
});
