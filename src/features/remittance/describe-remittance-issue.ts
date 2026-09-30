import type { RecordTypeCode } from "@/domain/cnab/layout";
import type { Cnab444Issue } from "@/domain/cnab/parse-cnab-444";
import type { SubmitError } from "@/features/remittance/submit-remittance";
import type { RemittanceFileRejection } from "@/features/remittance/validate-remittance-file";

type ServerOnlySubmitError = Exclude<
  SubmitError["code"],
  RemittanceFileRejection["code"] | "ABORTED"
>;

export type RemittanceMessageKey =
  | `issues.${Cnab444Issue["code"] | "UNEXPECTED_BLANK_LINE"}`
  | `rejections.${RemittanceFileRejection["code"]}`
  | `requestErrors.${ServerOnlySubmitError}`;

export interface RemittanceMessage {
  readonly key: RemittanceMessageKey;
  readonly values?: Readonly<Record<string, string | number>>;
}

export interface RemittanceRejectionDescription {
  readonly summary: RemittanceMessage;
  readonly details: readonly RemittanceMessage[];
  readonly truncated: boolean;
}

const recordKindByCode = {
  "0": "header",
  "1": "detail",
  "9": "trailer",
} as const satisfies Record<RecordTypeCode, string>;

export function toKilobytes(bytes: number): number {
  return Math.floor(bytes / 1024);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${JSON.stringify(value)}`);
}

export function describeRemittanceIssue(issue: Cnab444Issue): RemittanceMessage {
  switch (issue.code) {
    case "EMPTY_FILE":
    case "MISSING_DETAIL_RECORDS":
      return { key: `issues.${issue.code}` };
    case "INVALID_CHARACTERS":
    case "INVALID_RECORD_COUNT":
    case "INVALID_ACCESS_KEY_FORMAT":
      return { key: `issues.${issue.code}`, values: { lineNumber: issue.lineNumber } };
    case "INVALID_LINE_LENGTH":
      return {
        key: "issues.INVALID_LINE_LENGTH",
        values: { lineNumber: issue.lineNumber, expected: issue.expected, actual: issue.actual },
      };
    case "UNEXPECTED_RECORD_TYPE": {
      const expected = recordKindByCode[issue.expected];
      return issue.actual === ""
        ? {
            key: "issues.UNEXPECTED_BLANK_LINE",
            values: { lineNumber: issue.lineNumber, expected },
          }
        : {
            key: "issues.UNEXPECTED_RECORD_TYPE",
            values: { lineNumber: issue.lineNumber, expected, actual: issue.actual },
          };
    }
    case "RECORD_COUNT_MISMATCH":
      return {
        key: "issues.RECORD_COUNT_MISMATCH",
        values: { lineNumber: issue.lineNumber, declared: issue.declared, actual: issue.actual },
      };
    default:
      return assertNever(issue);
  }
}

export function describeRemittanceRejection(
  rejection: RemittanceFileRejection,
): RemittanceRejectionDescription {
  switch (rejection.code) {
    case "INVALID_FILE":
      return {
        summary: { key: "rejections.INVALID_FILE" },
        details: rejection.errors.map(describeRemittanceIssue),
        truncated: rejection.truncated,
      };
    case "TOO_MANY_RECEIVABLES":
      return {
        summary: {
          key: "rejections.TOO_MANY_RECEIVABLES",
          values: { max: rejection.max, actual: rejection.actual },
        },
        details: [],
        truncated: false,
      };
    case "FILE_TOO_LARGE":
      return {
        summary: {
          key: "rejections.FILE_TOO_LARGE",
          values: { maxKilobytes: toKilobytes(rejection.maxBytes) },
        },
        details: [],
        truncated: false,
      };
    case "MULTIPLE_FILES":
    case "UNREADABLE_FILE":
      return { summary: { key: `rejections.${rejection.code}` }, details: [], truncated: false };
    default:
      return assertNever(rejection);
  }
}

export function describeSubmitError(
  error: Exclude<SubmitError, { code: "ABORTED" }>,
): RemittanceRejectionDescription {
  switch (error.code) {
    case "INVALID_FILE":
    case "TOO_MANY_RECEIVABLES":
    case "FILE_TOO_LARGE":
      return describeRemittanceRejection(error);
    case "UNEXPECTED_RESPONSE":
      return {
        summary: { key: "requestErrors.UNEXPECTED_RESPONSE", values: { status: error.status } },
        details: [],
        truncated: false,
      };
    case "NETWORK_ERROR":
    case "INVALID_REQUEST":
    case "CROSS_SITE_REQUEST":
    case "LENGTH_REQUIRED":
      return { summary: { key: `requestErrors.${error.code}` }, details: [], truncated: false };
    default:
      return assertNever(error);
  }
}
