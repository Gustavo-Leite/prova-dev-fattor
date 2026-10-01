import type {
  RemittanceCheckEvent,
  RemittanceCheckPolicy,
  RemittanceStreamEvent,
} from "@/application/remittance/check-remittance";
import {
  checkRemittance,
  defaultRemittanceCheckPolicy,
} from "@/application/remittance/check-remittance";
import type { InvoiceStatusGateway } from "@/application/remittance/invoice-status-gateway";

export const maxUploadBytes = 128 * 1024;
export const multipartOverheadBytes = 16 * 1024;

export interface RemittanceUploadDependencies {
  readonly getGateway: () => InvoiceStatusGateway;
  readonly maxUploadBytes?: number;
  readonly policy?: RemittanceCheckPolicy;
}

const allowedFetchSites = new Set(["same-origin", "none"]);
const contentLengthPattern = /^\d+$/;

const noStore = { "cache-control": "no-store" } as const;

function errorResponse(status: number, body: { readonly code: string }): Response {
  return Response.json(body, { status, headers: noStore });
}

function toNdjsonStream(
  total: number,
  events: AsyncIterable<RemittanceCheckEvent>,
  stopChecks: AbortController,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = events[Symbol.asyncIterator]();
  const encodeLine = (event: RemittanceStreamEvent) => encoder.encode(`${JSON.stringify(event)}\n`);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encodeLine({ type: "started", total }));
    },
    async pull(controller) {
      const next = await iterator.next();
      if (next.done === true) {
        controller.close();
        return;
      }
      controller.enqueue(encodeLine(next.value));
    },
    async cancel() {
      stopChecks.abort();
      await iterator.return?.();
    },
  });
}

async function readUploadedFile(request: Request): Promise<File | null> {
  try {
    const files = (await request.formData()).getAll("file");
    const [file] = files;
    return files.length === 1 && file instanceof File ? file : null;
  } catch {
    return null;
  }
}

export function createRemittanceUploadHandler(dependencies: RemittanceUploadDependencies) {
  const uploadLimit = dependencies.maxUploadBytes ?? maxUploadBytes;
  const policy = dependencies.policy ?? defaultRemittanceCheckPolicy;

  return async function handleRemittanceUpload(request: Request): Promise<Response> {
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite !== null && !allowedFetchSites.has(fetchSite)) {
      return errorResponse(403, { code: "CROSS_SITE_REQUEST" });
    }
    const contentLength = request.headers.get("content-length");
    if (contentLength === null || !contentLengthPattern.test(contentLength)) {
      return errorResponse(411, { code: "LENGTH_REQUIRED" });
    }
    const tooLarge = { code: "FILE_TOO_LARGE", maxBytes: uploadLimit };
    if (Number(contentLength) > uploadLimit + multipartOverheadBytes) {
      return errorResponse(413, tooLarge);
    }

    const file = await readUploadedFile(request);
    if (!file) {
      return errorResponse(400, { code: "INVALID_REQUEST" });
    }
    if (file.size > uploadLimit) {
      return errorResponse(413, tooLarge);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const stopChecks = new AbortController();
    const check = checkRemittance(bytes, dependencies.getGateway(), {
      signal: AbortSignal.any([request.signal, stopChecks.signal]),
      policy,
    });
    if (!check.ok) {
      return errorResponse(422, check.rejection);
    }
    return new Response(toNdjsonStream(check.total, check.events, stopChecks), {
      status: 200,
      headers: {
        ...noStore,
        "content-type": "application/x-ndjson; charset=utf-8",
        "x-accel-buffering": "no",
      },
    });
  };
}
