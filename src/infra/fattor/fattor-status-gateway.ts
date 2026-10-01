import "server-only";

import type {
  InvoiceStatusGateway,
  LookupFailureReason,
} from "@/application/remittance/invoice-status-gateway";
import { InvoiceStatusLookupError } from "@/application/remittance/invoice-status-gateway";
import type { InvoiceStatus } from "@/domain/invoice/invoice-status";
import { parseStatusResponse } from "@/infra/fattor/fattor-api.contract";

export interface FattorStatusGatewayConfig {
  readonly baseUrl: string;
  readonly token: string;
}

export interface FattorGatewayOptions {
  readonly timeoutMs?: number;
  readonly retries?: number;
  readonly retryBaseDelayMs?: number;
  readonly maxRetryDelayMs?: number;
  readonly random?: () => number;
  readonly now?: () => number;
}

interface UpstreamReply {
  readonly status: number;
  readonly body: unknown;
}

const defaultOptions = {
  timeoutMs: 5_000,
  retries: 2,
  retryBaseDelayMs: 200,
  maxRetryDelayMs: 5_000,
  random: Math.random,
  now: Date.now,
} satisfies Required<FattorGatewayOptions>;

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
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

function sleep(delayMs: number, signal: AbortSignal): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const elapsed = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, delayMs);
  });
  return abortable(elapsed, signal).finally(() => {
    clearTimeout(timer);
  });
}

function retryAfterMs(response: Response, now: number): number | null {
  const header = response.headers.get("retry-after");
  if (header === null) {
    return null;
  }
  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return seconds * 1000;
  }
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : date - now;
}

function discardBody(response: Response): void {
  void response.body?.cancel().catch(() => undefined);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export function createFattorStatusGateway(
  config: FattorStatusGatewayConfig,
  gatewayOptions: FattorGatewayOptions = {},
): InvoiceStatusGateway {
  const options = { ...defaultOptions, ...gatewayOptions };

  const backoffMs = (attempt: number, requestedMs: number | null): number => {
    const exponential = options.retryBaseDelayMs * 2 ** attempt;
    const jittered = exponential / 2 + (options.random() * exponential) / 2;
    return Math.min(Math.max(jittered, requestedMs ?? 0), options.maxRetryDelayMs);
  };

  const send = async (
    url: string,
    init: RequestInit,
    signal: AbortSignal,
  ): Promise<UpstreamReply> => {
    let failure: LookupFailureReason = "UPSTREAM_UNAVAILABLE";
    let lastCause: unknown;
    for (let attempt = 0; attempt <= options.retries; attempt++) {
      const attemptTimeout = new AbortController();
      const timer = setTimeout(() => {
        attemptTimeout.abort();
      }, options.timeoutMs);
      const attemptSignal = AbortSignal.any([signal, attemptTimeout.signal]);
      let requestedDelayMs: number | null = null;
      try {
        const response = await fetch(url, { ...init, redirect: "manual", signal: attemptSignal });
        if (!isRetryableStatus(response.status)) {
          if (!isSuccessStatus(response.status)) {
            discardBody(response);
            return { status: response.status, body: undefined };
          }
          const text = await abortable(response.text(), attemptSignal);
          return { status: response.status, body: parseJson(text) };
        }
        failure = "UPSTREAM_UNAVAILABLE";
        lastCause = new Error(`Upstream answered ${String(response.status)}`);
        requestedDelayMs = retryAfterMs(response, options.now());
        discardBody(response);
      } catch (error) {
        if (signal.aborted) {
          throw error;
        }
        lastCause = error;
        failure = attemptTimeout.signal.aborted ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE";
      } finally {
        clearTimeout(timer);
      }
      if (attempt < options.retries) {
        await sleep(backoffMs(attempt, requestedDelayMs), signal);
      }
    }
    throw new InvoiceStatusLookupError(failure, { cause: lastCause });
  };

  const findStatus = async (
    invoiceAccessKey: string,
    signal: AbortSignal,
  ): Promise<InvoiceStatus> => {
    const reply = await send(
      `${config.baseUrl}/status/${encodeURIComponent(invoiceAccessKey)}`,
      { headers: { authorization: `Bearer ${config.token}`, accept: "application/json" } },
      signal,
    );
    if (reply.status === 401) {
      throw new InvoiceStatusLookupError("UPSTREAM_REJECTED_CREDENTIALS");
    }
    if (!isSuccessStatus(reply.status)) {
      throw new InvoiceStatusLookupError("UPSTREAM_UNAVAILABLE");
    }
    const parsed = parseStatusResponse(reply.body);
    if (parsed?.invoiceAccessKey !== invoiceAccessKey) {
      throw new InvoiceStatusLookupError("UPSTREAM_INVALID_RESPONSE");
    }
    return parsed.status;
  };

  return { findStatus };
}
