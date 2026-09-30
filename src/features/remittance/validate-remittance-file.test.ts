import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, expect, it } from "vitest";

import { validateRemittanceFile } from "@/features/remittance/validate-remittance-file";

const sampleBytes = new Uint8Array(
  readFileSync(path.join(import.meta.dirname, "../../../_prova/meu_cnab.rem")),
);
const limits = { maxUploadBytes: 131_072, maxReceivables: 200 };

function fileOf(bytes: Uint8Array<ArrayBuffer>) {
  let reads = 0;
  const blob = new Blob([bytes]);
  return {
    file: {
      size: blob.size,
      arrayBuffer: () => {
        reads++;
        return blob.arrayBuffer();
      },
    },
    reads: () => reads,
  };
}

describe("validateRemittanceFile", () => {
  it("accepts the sample file with its receivables", async () => {
    const validation = await validateRemittanceFile(fileOf(sampleBytes).file, limits);
    assert(validation.ok);
    expect(validation.receivables).toHaveLength(10);
  });

  it("rejects a file above the size limit without reading it", async () => {
    const upload = fileOf(new Uint8Array(limits.maxUploadBytes + 1));
    expect(await validateRemittanceFile(upload.file, limits)).toEqual({
      ok: false,
      rejection: { code: "FILE_TOO_LARGE", maxBytes: limits.maxUploadBytes },
    });
    expect(upload.reads()).toBe(0);
  });

  it("reads a file exactly at the size limit", async () => {
    const upload = fileOf(new Uint8Array(limits.maxUploadBytes));
    const validation = await validateRemittanceFile(upload.file, limits);
    expect(validation).toMatchObject({ ok: false, rejection: { code: "INVALID_FILE" } });
    expect(upload.reads()).toBe(1);
  });

  it("rejects a file that cannot be read, such as a dropped folder", async () => {
    const unreadable = {
      size: 10,
      arrayBuffer: () => Promise.reject(new DOMException("gone", "NotReadableError")),
    };
    expect(await validateRemittanceFile(unreadable, limits)).toEqual({
      ok: false,
      rejection: { code: "UNREADABLE_FILE" },
    });
  });

  it("rejects more receivables than allowed, like the server", async () => {
    const validation = await validateRemittanceFile(fileOf(sampleBytes).file, {
      ...limits,
      maxReceivables: 9,
    });
    expect(validation).toEqual({
      ok: false,
      rejection: { code: "TOO_MANY_RECEIVABLES", max: 9, actual: 10 },
    });
  });
});
