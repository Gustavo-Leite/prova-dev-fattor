import { describe, expect, it } from "vitest";

import { maxEmailLength, maxPasswordLength } from "@/features/session/sign-in-fields";
import { parseSignInInput, readSubmittedEmail } from "@/features/session/sign-in-input";

function formWith(fields: Readonly<Record<string, string | Blob>>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    formData.append(name, value);
  }
  return formData;
}

function emailOfLength(length: number): string {
  const domain = "@example.test";
  return `${"a".repeat(length - domain.length)}${domain}`;
}

describe("parseSignInInput", () => {
  it("accepts a valid email and password", () => {
    expect(parseSignInInput(formWith({ email: "user@example.test", password: "secret" }))).toEqual({
      ok: true,
      credentials: { email: "user@example.test", password: "secret" },
    });
  });

  it("trims the email but keeps the password exactly as typed", () => {
    expect(
      parseSignInInput(formWith({ email: "  user@example.test\n", password: " secret " })),
    ).toEqual({ ok: true, credentials: { email: "user@example.test", password: " secret " } });
  });

  it("reports both fields as required when they are missing", () => {
    expect(parseSignInInput(new FormData())).toEqual({
      ok: false,
      fieldErrors: { email: "required", password: "required" },
    });
  });

  it("treats a blank email as missing", () => {
    expect(parseSignInInput(formWith({ email: "   ", password: "secret" }))).toEqual({
      ok: false,
      fieldErrors: { email: "required" },
    });
  });

  it("treats an empty password as missing", () => {
    expect(parseSignInInput(formWith({ email: "user@example.test", password: "" }))).toEqual({
      ok: false,
      fieldErrors: { password: "required" },
    });
  });

  it.each(["user", "user@", "@example.test", "user@localhost", "user example@test.com"])(
    "rejects the malformed email %j",
    (email) => {
      expect(parseSignInInput(formWith({ email, password: "secret" }))).toEqual({
        ok: false,
        fieldErrors: { email: "invalid" },
      });
    },
  );

  it("accepts an email at the maximum length and rejects a longer one", () => {
    expect(
      parseSignInInput(formWith({ email: emailOfLength(maxEmailLength), password: "secret" })).ok,
    ).toBe(true);
    expect(
      parseSignInInput(formWith({ email: emailOfLength(maxEmailLength + 1), password: "secret" })),
    ).toEqual({ ok: false, fieldErrors: { email: "tooLong" } });
  });

  it("accepts a password at the maximum length and rejects a longer one", () => {
    const email = "user@example.test";
    expect(parseSignInInput(formWith({ email, password: "p".repeat(maxPasswordLength) })).ok).toBe(
      true,
    );
    expect(
      parseSignInInput(formWith({ email, password: "p".repeat(maxPasswordLength + 1) })),
    ).toEqual({ ok: false, fieldErrors: { password: "tooLong" } });
  });

  it("treats files posted in place of text as missing", () => {
    expect(
      parseSignInInput(formWith({ email: new Blob(["a"]), password: new Blob(["b"]) })),
    ).toEqual({ ok: false, fieldErrors: { email: "required", password: "required" } });
  });
});

describe("readSubmittedEmail", () => {
  it("returns the email as typed so the form can show it again", () => {
    expect(readSubmittedEmail(formWith({ email: " user@localhost " }))).toBe(" user@localhost ");
  });

  it("returns an empty string when the email is missing or is a file", () => {
    expect(readSubmittedEmail(new FormData())).toBe("");
    expect(readSubmittedEmail(formWith({ email: new Blob(["a"]) }))).toBe("");
  });

  it("caps an oversized email so the form never reflects it whole", () => {
    expect(readSubmittedEmail(formWith({ email: "a".repeat(10_000) }))).toBe(
      "a".repeat(maxEmailLength),
    );
  });
});
