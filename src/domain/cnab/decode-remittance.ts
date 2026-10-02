const utf8ByteOrderMark = [0xef, 0xbb, 0xbf] as const;

const singleByteDecoder = new TextDecoder("windows-1252");
const strictUtf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function startsWithUtf8ByteOrderMark(bytes: Uint8Array): boolean {
  return utf8ByteOrderMark.every((byte, index) => bytes[index] === byte);
}

function decodeUtf8OrSingleByte(bytes: Uint8Array): string {
  try {
    return strictUtf8Decoder.decode(bytes);
  } catch {
    return singleByteDecoder.decode(bytes);
  }
}

export function decodeRemittance(bytes: Uint8Array): string {
  if (startsWithUtf8ByteOrderMark(bytes)) {
    return decodeUtf8OrSingleByte(bytes.subarray(utf8ByteOrderMark.length));
  }
  return singleByteDecoder.decode(bytes);
}
