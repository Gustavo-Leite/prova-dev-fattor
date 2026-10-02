import "server-only";

export function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(signal.reason as Error);
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    void promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

export function discardBody(response: Response): void {
  void response.body?.cancel().catch(() => undefined);
}

function declaresOversizedBody(response: Response, maxBytes: number): boolean {
  const declaredLength = Number(response.headers.get("content-length"));
  return Number.isFinite(declaredLength) && declaredLength > maxBytes;
}

export async function readCappedText(
  response: Response,
  signal: AbortSignal,
  maxBytes: number,
): Promise<string | null> {
  if (declaresOversizedBody(response, maxBytes)) {
    discardBody(response);
    return null;
  }
  if (!response.body) {
    return "";
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let text = "";
  for (;;) {
    const chunk = await abortable(reader.read(), signal);
    if (chunk.done) {
      return text + decoder.decode();
    }
    receivedBytes += chunk.value.byteLength;
    if (receivedBytes > maxBytes) {
      void reader.cancel().catch(() => undefined);
      return null;
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
