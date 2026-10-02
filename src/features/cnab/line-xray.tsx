import type { FieldPosition } from "@/domain/cnab/layout";
import { readField } from "@/domain/cnab/layout";
import { usePositionLabel } from "@/features/cnab/use-position-label";

export type LineXraySegmentTone = "solid" | "muted" | "underline" | "observed";

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
  observed: "box-decoration-clone bg-muted text-foreground inset-ring inset-ring-ring",
};

const swatchClasses: Record<LineXraySegmentTone, string> = {
  solid: "size-3 rounded-sm bg-primary",
  muted: "size-3 rounded-sm border border-input bg-muted",
  underline: "h-0.5 w-3 bg-ring",
  observed: "size-3 rounded-sm bg-muted inset-ring inset-ring-ring",
};

interface LinePiece {
  readonly start: number;
  readonly text: string;
  readonly tone: LineXraySegmentTone | null;
}

function splitLine(line: string, segments: readonly LineXraySegment[]): LinePiece[] {
  const pieces: LinePiece[] = [];
  let nextColumn = 1;
  for (const { position, tone } of segments) {
    if (position.start > nextColumn) {
      const gap = { start: nextColumn, end: position.start - 1 };
      pieces.push({ start: gap.start, text: readField(line, gap), tone: null });
    }
    pieces.push({ start: position.start, text: readField(line, position), tone });
    nextColumn = position.end + 1;
  }
  if (nextColumn <= line.length) {
    pieces.push({ start: nextColumn, text: line.slice(nextColumn - 1), tone: null });
  }
  return pieces;
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
        {splitLine(line, segments).map((piece) => (
          <span key={piece.start} className={piece.tone ? segmentClasses[piece.tone] : undefined}>
            {piece.text}
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
