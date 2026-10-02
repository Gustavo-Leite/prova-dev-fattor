import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ErrorFallback } from "@/components/error-fallback";
import en from "@/i18n/messages/en.json";
import ptBR from "@/i18n/messages/pt-BR.json";
import { homePath } from "@/lib/routes";

import ErrorPage from "./error";

const catalogs = { "pt-BR": ptBR, en };

function renderErrorPage(
  error: Error & { digest?: string },
  locale: keyof typeof catalogs = "pt-BR",
) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={catalogs[locale]}>
      <ErrorPage error={error} retry={() => undefined} />
    </NextIntlClientProvider>,
  );
}

interface ElementProps {
  children?: ReactNode;
  onClick?: (event: unknown) => void;
}

function findElementByType(node: ReactNode, type: string): ElementProps | undefined {
  if (Array.isArray(node)) {
    for (const child of node as ReactNode[]) {
      const found = findElementByType(child, type);
      if (found) {
        return found;
      }
    }
    return undefined;
  }
  if (!isValidElement<ElementProps>(node)) {
    return undefined;
  }
  if (node.type === type) {
    return node.props;
  }
  return findElementByType(node.props.children, type);
}

describe("ErrorPage", () => {
  it("shows the translated title, description and actions inside a main landmark", () => {
    const markup = renderErrorPage(new Error("boom"));

    expect(markup).toContain("<main");
    expect(markup).toContain(`<title>${ptBR.errorPage.title} · ${ptBR.metadata.title}</title>`);
    expect(markup).toContain(`>${ptBR.errorPage.title}</h1>`);
    expect(markup).toContain(ptBR.errorPage.description);
    expect(markup).toContain(ptBR.errorPage.retry);
    expect(markup).toContain(ptBR.errorPage.home);
  });

  it("links back to the home page", () => {
    const markup = renderErrorPage(new Error("boom"));

    expect(markup).toContain(`href="${homePath}"`);
  });

  it("never shows the error message", () => {
    const markup = renderErrorPage(Object.assign(new Error("secret detail"), { digest: "123" }));

    expect(markup).not.toContain("secret detail");
  });

  it("shows the digest as an error code when there is one", () => {
    const markup = renderErrorPage(Object.assign(new Error("boom"), { digest: "4242424242" }));

    expect(markup).toContain(ptBR.errorPage.errorCode);
    expect(markup).toContain("4242424242");
  });

  it.each(Object.keys(catalogs) as (keyof typeof catalogs)[])(
    "omits the error code in %s when there is no digest",
    (locale) => {
      const markup = renderErrorPage(new Error("boom"), locale);

      expect(markup).toContain(catalogs[locale].errorPage.title);
      expect(markup).not.toContain(catalogs[locale].errorPage.errorCode);
      expect(markup).not.toContain("<code");
    },
  );
});

describe("ErrorFallback", () => {
  it("calls onRetry without arguments when the retry button is clicked", () => {
    const onRetry = vi.fn<() => void>();
    const element = ErrorFallback({
      title: "title",
      description: "description",
      retryLabel: "retry",
      homeLabel: "home",
      homeHref: homePath,
      errorCodeLabel: "code",
      onRetry,
    });

    const button = findElementByType(element, "button");
    button?.onClick?.({ type: "click" });

    expect(button).toBeDefined();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith();
  });
});
