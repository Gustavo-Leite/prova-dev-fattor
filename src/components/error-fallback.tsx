import { buttonVariants } from "@/components/ui/button-variants";

interface ErrorFallbackProps {
  title: string;
  description: string;
  retryLabel: string;
  homeLabel: string;
  homeHref: string;
  errorCodeLabel: string;
  digest?: string;
  headingLevel?: 1 | 2;
  onRetry: () => void;
}

export function ErrorFallback({
  title,
  description,
  retryLabel,
  homeLabel,
  homeHref,
  errorCodeLabel,
  digest,
  headingLevel = 1,
  onRetry,
}: ErrorFallbackProps) {
  const Heading = headingLevel === 1 ? "h1" : "h2";

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <Heading className="text-2xl font-semibold">{title}</Heading>
      <p className="text-muted-foreground">{description}</p>
      <div className="flex flex-wrap items-center justify-center gap-4">
        <button
          type="button"
          className={buttonVariants()}
          onClick={() => {
            onRetry();
          }}
        >
          {retryLabel}
        </button>
        <a href={homeHref} className="text-brand-gold-text underline underline-offset-4">
          {homeLabel}
        </a>
      </div>
      {digest ? (
        <p className="flex flex-wrap items-center justify-center gap-1 text-xs text-muted-foreground">
          <span>{errorCodeLabel}</span>
          <code className="font-mono">{digest}</code>
        </p>
      ) : null}
    </div>
  );
}
