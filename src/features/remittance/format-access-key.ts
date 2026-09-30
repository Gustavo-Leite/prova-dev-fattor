const issuerIdLength = 14;

export function formatIssuerId(issuerId: string): string {
  if (issuerId.length !== issuerIdLength) {
    return issuerId;
  }
  return `${issuerId.slice(0, 2)}.${issuerId.slice(2, 5)}.${issuerId.slice(5, 8)}/${issuerId.slice(8, 12)}-${issuerId.slice(12)}`;
}

export function withoutLeadingZeros(value: string): string {
  return value.replace(/^0+(?=.)/, "");
}

export function groupAccessKey(key: string): string {
  return key.replace(/(.{4})(?=.)/g, "$1 ");
}
