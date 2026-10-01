"use client";

import { useTranslations } from "next-intl";

import type { FieldPosition } from "@/domain/cnab/layout";
import { readField } from "@/domain/cnab/layout";

export type LineXraySegmentTone = "solid" | "muted" | "underline";

export interface LineXraySegment {
  readonly position: FieldPosition;
  readonly tone: LineXraySegmentTone;
  readonly label: string;
}

const segmentClasses: Record<LineXraySegmentTone, string> = {
  solid: "bg-primary text-primary-foreground",
  muted: "bg-muted text-muted-foreground",
  underline:
    "font-semibold text-foreground underline decoration-ring decoration-2 underline-offset-4",
};

const swatchClasses: Record<LineXraySegmentTone, string> = {
  solid: "size-3 rounded-sm bg-primary",
  muted: "size-3 rounded-sm border border-input bg-muted",
  underline: "h-0.5 w-3 bg-ring",
};

export function usePositionLabel(): (position: FieldPosition) => string {
  const t = useTranslations("cnab");
  return ({ start, end }) =>
    start === end ? t("position", { start }) : t("positions", { start, end });
}

export interface LineXrayProps {
  readonly line: string;
  readonly segments: readonly LineXraySegment[];
  readonly label: string;
  readonly caption: string;
}

export function LineXray({ line, segments, label, caption }: LineXrayProps) {
  const positionLabel = usePositionLabel();

  return (
    <figure className="flex flex-col gap-2">
      <pre
        role="img"
        aria-label={label}
        className="rounded-lg border p-2 font-mono text-[0.6875rem] leading-5 break-all whitespace-break-spaces"
      >
        {segments.map((segment) => (
          <span key={segment.position.start} className={segmentClasses[segment.tone]}>
            {readField(line, segment.position)}
          </span>
        ))}
      </pre>
      <figcaption className="flex flex-col gap-1 text-xs text-muted-foreground">
        <span>{caption}</span>
        <ul className="flex flex-col gap-1">
          {segments.map((segment) => (
            <li key={segment.position.start} className="flex items-center gap-2">
              <span aria-hidden="true" className={`shrink-0 ${swatchClasses[segment.tone]}`} />
              <span>
                {segment.label}{" "}
                <span className="tabular-nums">{positionLabel(segment.position)}</span>
              </span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
