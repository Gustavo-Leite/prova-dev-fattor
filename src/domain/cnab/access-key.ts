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
