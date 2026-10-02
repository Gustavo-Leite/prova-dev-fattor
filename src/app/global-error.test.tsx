import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import globalErrorMessages from "@/i18n/messages/global-error.json";
import { supportedLocales } from "@/lib/locale";
import { homePath } from "@/lib/routes";

import GlobalError from "./global-error";

function renderGlobalError(error: Error & { digest?: string }) {
  return renderToStaticMarkup(<GlobalError error={error} retry={() => undefined} />);
}

describe("GlobalError", () => {
  it("renders its own document in the default locale", () => {
    const markup = renderGlobalError(new Error("boom"));

    expect(markup).toMatch(/^<html lang="pt-BR"/);
    expect(markup).toContain("<body");
    expect(markup).toContain("<main");
  });

  it("titles the document in every locale", () => {
    const markup = renderGlobalError(new Error("boom"));

    expect(markup).toContain(
      `<title>${globalErrorMessages["pt-BR"].title} | ${globalErrorMessages.en.title}</title>`,
    );
  });

  it.each(supportedLocales)("shows the %s message block with its own lang", (locale) => {
    const markup = renderGlobalError(new Error("boom"));
    const messages = globalErrorMessages[locale];

    expect(markup).toContain(`<section lang="${locale}"`);
    expect(markup).toContain(messages.title);
    expect(markup).toContain(messages.description);
    expect(markup).toContain(messages.retry);
    expect(markup).toContain(messages.home);
  });

  it("uses a single h1 for the first locale and h2 for the others", () => {
    const markup = renderGlobalError(new Error("boom"));

    expect(markup.match(/<h1/g)).toHaveLength(1);
    expect(markup).toContain(`>${globalErrorMessages["pt-BR"].title}</h1>`);
    expect(markup).toContain(`>${globalErrorMessages.en.title}</h2>`);
  });

  it("links back to the home page in every locale", () => {
    const markup = renderGlobalError(new Error("boom"));

    expect(markup.split(`href="${homePath}"`)).toHaveLength(supportedLocales.length + 1);
  });

  it("never shows the error message", () => {
    const markup = renderGlobalError(Object.assign(new Error("secret detail"), { digest: "123" }));

    expect(markup).not.toContain("secret detail");
  });

  it("shows the digest when there is one", () => {
    const markup = renderGlobalError(Object.assign(new Error("boom"), { digest: "4242424242" }));

    expect(markup).toContain("4242424242");
    expect(markup).toContain(globalErrorMessages.en.errorCode);
    expect(markup).toContain(globalErrorMessages["pt-BR"].errorCode);
  });

  it.each(supportedLocales)("omits the %s error code when there is no digest", (locale) => {
    const markup = renderGlobalError(new Error("boom"));

    expect(markup).not.toContain(globalErrorMessages[locale].errorCode);
    expect(markup).not.toContain("<code");
  });

  it("defines the same keys for every locale", () => {
    const keysByLocale = supportedLocales.map((locale) =>
      Object.keys(globalErrorMessages[locale]).sort(),
    );

    for (const keys of keysByLocale) {
      expect(keys).toEqual(keysByLocale[0]);
    }
  });
});
