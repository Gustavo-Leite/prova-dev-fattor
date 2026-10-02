import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import type { Cnab444Issue } from "@/domain/cnab/parse-cnab-444";
import type { RemittanceMessage } from "@/features/remittance/describe-remittance-issue";
import {
  describeRemittanceIssue,
  describeRemittanceRejection,
  describeSubmitError,
} from "@/features/remittance/describe-remittance-issue";
import type { RemittanceFileRejection } from "@/features/remittance/validate-remittance-file";
import en from "@/i18n/messages/en.json";
import ptBr from "@/i18n/messages/pt-BR.json";

const translators = {
  en: createTranslator({ locale: "en", messages: en, namespace: "remittance" }),
  "pt-BR": createTranslator({ locale: "pt-BR", messages: ptBr, namespace: "remittance" }),
};

function render(locale: keyof typeof translators, message: RemittanceMessage): string {
  return translators[locale](message.key, message.values);
}

const everyIssue: readonly Cnab444Issue[] = [
  { code: "EMPTY_FILE" },
  { code: "INVALID_CHARACTERS", lineNumber: 3 },
  { code: "INVALID_LINE_LENGTH", lineNumber: 4, expected: 444, actual: 400 },
  { code: "UNEXPECTED_RECORD_TYPE", lineNumber: 1, expected: "0", actual: "1" },
  { code: "UNEXPECTED_RECORD_TYPE", lineNumber: 7, expected: "1", actual: "" },
  { code: "MISSING_DETAIL_RECORDS" },
  { code: "INVALID_RECORD_COUNT", lineNumber: 12 },
  { code: "RECORD_COUNT_MISMATCH", lineNumber: 12, declared: 13, actual: 12 },
  { code: "INVALID_ACCESS_KEY_FORMAT", lineNumber: 5 },
];

const everyRejection: readonly RemittanceFileRejection[] = [
  { code: "INVALID_FILE", errors: [{ code: "EMPTY_FILE" }], truncated: true },
  { code: "TOO_MANY_RECEIVABLES", max: 200, actual: 250 },
  { code: "FILE_TOO_LARGE", maxBytes: 131_072 },
  { code: "MULTIPLE_FILES" },
  { code: "UNREADABLE_FILE" },
];

describe("describeRemittanceIssue", () => {
  it.each(Object.keys(translators) as (keyof typeof translators)[])(
    "has a complete message for every issue in %s",
    (locale) => {
      for (const issue of everyIssue) {
        const text = render(locale, describeRemittanceIssue(issue));
        expect(text).not.toMatch(/[{}]|remittance\./);
        if ("lineNumber" in issue) {
          expect(text).toContain(String(issue.lineNumber));
        }
      }
    },
  );

  it("names the expected record and quotes what was found", () => {
    const issue: Cnab444Issue = {
      code: "UNEXPECTED_RECORD_TYPE",
      lineNumber: 1,
      expected: "0",
      actual: "1",
    };
    expect(render("en", describeRemittanceIssue(issue))).toBe(
      "Line 1: record of type “1”; expected a header (0).",
    );
    expect(render("pt-BR", describeRemittanceIssue(issue))).toBe(
      "Linha 1: registro do tipo “1”; esperado um header (0).",
    );
  });

  it("describes a blank line instead of quoting an empty record type", () => {
    const issue: Cnab444Issue = {
      code: "UNEXPECTED_RECORD_TYPE",
      lineNumber: 7,
      expected: "1",
      actual: "",
    };
    expect(render("en", describeRemittanceIssue(issue))).toBe(
      "Line 7: is blank; expected a detail (1).",
    );
  });

  it.each([
    [
      1,
      "Linha 2: tem 1 caractere; o esperado são 444.",
      "Line 2: has 1 character; 444 are expected.",
    ],
    [0, "Linha 2: está vazia; o esperado são 444.", "Line 2: is empty; 444 are expected."],
    [
      400,
      "Linha 2: tem 400 caracteres; o esperado são 444.",
      "Line 2: has 400 characters; 444 are expected.",
    ],
  ])("pluralizes a line with %i characters", (actual, portuguese, english) => {
    const issue: Cnab444Issue = {
      code: "INVALID_LINE_LENGTH",
      lineNumber: 2,
      expected: 444,
      actual,
    };
    expect(render("pt-BR", describeRemittanceIssue(issue))).toBe(portuguese);
    expect(render("en", describeRemittanceIssue(issue))).toBe(english);
  });

  it("keeps the counts of a mismatched trailer", () => {
    const issue: Cnab444Issue = {
      code: "RECORD_COUNT_MISMATCH",
      lineNumber: 12,
      declared: 13,
      actual: 12,
    };
    expect(render("pt-BR", describeRemittanceIssue(issue))).toBe(
      "Linha 12: o trailer informa 13 registros, mas o arquivo tem 12.",
    );
  });

  it.each([
    [0, "Linha 12: o trailer informa 0 registros, mas o arquivo tem 12."],
    [1, "Linha 12: o trailer informa 1 registro, mas o arquivo tem 12."],
  ])("uses the right plural when the trailer states %i records", (declared, expected) => {
    const issue: Cnab444Issue = {
      code: "RECORD_COUNT_MISMATCH",
      lineNumber: 12,
      declared,
      actual: 12,
    };
    expect(render("pt-BR", describeRemittanceIssue(issue))).toBe(expected);
  });
});

describe("describeSubmitError", () => {
  const everySubmitError: readonly Parameters<typeof describeSubmitError>[0][] = [
    { code: "NETWORK_ERROR" },
    { code: "UNEXPECTED_RESPONSE", status: 502 },
    { code: "INVALID_REQUEST" },
    { code: "CROSS_SITE_REQUEST" },
    { code: "SESSION_EXPIRED" },
    { code: "LENGTH_REQUIRED" },
    { code: "FILE_TOO_LARGE", maxBytes: 131_072 },
    { code: "TOO_MANY_RECEIVABLES", max: 200, actual: 250 },
    { code: "INVALID_FILE", errors: [{ code: "EMPTY_FILE" }], truncated: false },
  ];

  it.each(Object.keys(translators) as (keyof typeof translators)[])(
    "has a complete message for every request error in %s",
    (locale) => {
      for (const error of everySubmitError) {
        const text = render(locale, describeSubmitError(error).summary);
        expect(text).not.toMatch(/[{}]|remittance\./);
      }
    },
  );

  it("reuses the upload messages for rejections the server repeats", () => {
    expect(describeSubmitError({ code: "FILE_TOO_LARGE", maxBytes: 131_072 })).toEqual(
      describeRemittanceRejection({ code: "FILE_TOO_LARGE", maxBytes: 131_072 }),
    );
    expect(
      render("pt-BR", describeSubmitError({ code: "UNEXPECTED_RESPONSE", status: 502 }).summary),
    ).toBe("O servidor respondeu de forma inesperada (código 502).");
  });

  it("explains that the session has expired", () => {
    const description = describeSubmitError({ code: "SESSION_EXPIRED" });
    expect(render("pt-BR", description.summary)).toBe("Sua sessão expirou.");
    expect(render("en", description.summary)).toBe("Your session has expired.");
  });
});

describe("describeRemittanceRejection", () => {
  it.each(Object.keys(translators) as (keyof typeof translators)[])(
    "has a complete summary for every rejection in %s",
    (locale) => {
      for (const rejection of everyRejection) {
        const text = render(locale, describeRemittanceRejection(rejection).summary);
        expect(text).not.toMatch(/[{}]|remittance\./);
      }
    },
  );

  it("lists the parser errors and keeps the truncation flag", () => {
    const description = describeRemittanceRejection({
      code: "INVALID_FILE",
      errors: [
        { code: "INVALID_LINE_LENGTH", lineNumber: 2, expected: 444, actual: 400 },
        { code: "MISSING_DETAIL_RECORDS" },
      ],
      truncated: true,
    });
    expect(description.details.map((detail) => detail.key)).toEqual([
      "issues.INVALID_LINE_LENGTH",
      "issues.MISSING_DETAIL_RECORDS",
    ]);
    expect(description.truncated).toBe(true);
  });

  it("states the limits in the units the user sees", () => {
    expect(
      render(
        "en",
        describeRemittanceRejection({ code: "FILE_TOO_LARGE", maxBytes: 131_072 }).summary,
      ),
    ).toBe("The file is larger than 128 KB.");
    expect(
      render(
        "pt-BR",
        describeRemittanceRejection({ code: "TOO_MANY_RECEIVABLES", max: 200, actual: 250 })
          .summary,
      ),
    ).toBe("O arquivo tem 250 títulos; o limite é 200 por envio.");
  });
});
