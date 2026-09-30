const utf8ByteOrderMark = [0xef, 0xbb, 0xbf] as const;

const singleByteDecoder = new TextDecoder("windows-1252");

function startsWithUtf8ByteOrderMark(bytes: Uint8Array): boolean {
  return utf8ByteOrderMark.every((byte, index) => bytes[index] === byte);
}

export function decodeRemittance(bytes: Uint8Array): string {
  const content = startsWithUtf8ByteOrderMark(bytes)
    ? bytes.subarray(utf8ByteOrderMark.length)
    : bytes;
  return singleByteDecoder.decode(content);
}
