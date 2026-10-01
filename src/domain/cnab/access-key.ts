import type { FieldPosition } from "@/domain/cnab/layout";
import { readField } from "@/domain/cnab/layout";

const accessKeyPattern = /^\d{6}[0-9A-Z]{12}\d{26}$/;

const asciiZeroCode = 48;
const firstWeight = 2;
const weightCycleLength = 8;
const modulus = 11;

export function isAccessKeyFormatValid(key: string): boolean {
  return accessKeyPattern.test(key);
}

function computeCheckDigit(body: string): number {
  let weightedSum = 0;
  for (let offset = 0; offset < body.length; offset++) {
    const characterValue = body.charCodeAt(body.length - 1 - offset) - asciiZeroCode;
    weightedSum += characterValue * (firstWeight + (offset % weightCycleLength));
  }
  const remainder = weightedSum % modulus;
  return remainder < 2 ? 0 : modulus - remainder;
}

export function hasValidCheckDigit(key: string): boolean {
  if (!isAccessKeyFormatValid(key)) {
    return false;
  }
  return computeCheckDigit(key.slice(0, -1)) === Number(key.slice(-1));
}

export const accessKeyLayout = {
  stateCode: { start: 1, end: 2 },
  yearMonth: { start: 3, end: 6 },
  issuerId: { start: 7, end: 20 },
  model: { start: 21, end: 22 },
  series: { start: 23, end: 25 },
  number: { start: 26, end: 34 },
  emissionType: { start: 35, end: 35 },
  randomCode: { start: 36, end: 43 },
  checkDigit: { start: 44, end: 44 },
} as const satisfies Record<string, FieldPosition>;

export type AccessKeyField = keyof typeof accessKeyLayout;

const stateAbbreviations: Readonly<Record<string, string>> = {
  "11": "RO",
  "12": "AC",
  "13": "AM",
  "14": "RR",
  "15": "PA",
  "16": "AP",
  "17": "TO",
  "21": "MA",
  "22": "PI",
  "23": "CE",
  "24": "RN",
  "25": "PB",
  "26": "PE",
  "27": "AL",
  "28": "SE",
  "29": "BA",
  "31": "MG",
  "32": "ES",
  "33": "RJ",
  "35": "SP",
  "41": "PR",
  "42": "SC",
  "43": "RS",
  "50": "MS",
  "51": "MT",
  "52": "GO",
  "53": "DF",
};

const firstCenturyYear = 2000;

export interface IssuedMonth {
  readonly year: number;
  readonly month: number;
}

export interface AccessKeyParts {
  readonly fields: Readonly<Record<AccessKeyField, string>>;
  readonly stateAbbreviation: string | null;
  readonly issuedMonth: IssuedMonth | null;
  readonly expectedCheckDigit: number;
}

function toIssuedMonth(yearMonth: string): IssuedMonth | null {
  const month = Number(yearMonth.slice(2));
  if (month < 1 || month > 12) {
    return null;
  }
  return { year: firstCenturyYear + Number(yearMonth.slice(0, 2)), month };
}

export function splitAccessKey(key: string): AccessKeyParts | null {
  if (!isAccessKeyFormatValid(key)) {
    return null;
  }
  const fields = {
    stateCode: readField(key, accessKeyLayout.stateCode),
    yearMonth: readField(key, accessKeyLayout.yearMonth),
    issuerId: readField(key, accessKeyLayout.issuerId),
    model: readField(key, accessKeyLayout.model),
    series: readField(key, accessKeyLayout.series),
    number: readField(key, accessKeyLayout.number),
    emissionType: readField(key, accessKeyLayout.emissionType),
    randomCode: readField(key, accessKeyLayout.randomCode),
    checkDigit: readField(key, accessKeyLayout.checkDigit),
  };
  return {
    fields,
    stateAbbreviation: stateAbbreviations[fields.stateCode] ?? null,
    issuedMonth: toIssuedMonth(fields.yearMonth),
    expectedCheckDigit: computeCheckDigit(key.slice(0, -1)),
  };
}
