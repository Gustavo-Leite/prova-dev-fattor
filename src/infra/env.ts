import "server-only";

import { z } from "zod";

const serverEnvSchema = z
  .object({
    FATTOR_API_BASE_URL: z
      .url({ protocol: /^https$/ })
      .refine(
        (value) => {
          const url = new URL(value);
          return url.username === "" && url.password === "" && url.search === "" && url.hash === "";
        },
        { message: "Must not contain credentials, a query string or a fragment" },
      )
      .transform((value) => {
        const url = new URL(value);
        return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
      }),
  })
  .transform((env) => ({
    fattorApi: {
      baseUrl: env.FATTOR_API_BASE_URL,
    },
  }));

export type ServerEnv = z.output<typeof serverEnvSchema>;

export class InvalidServerEnvError extends Error {
  override readonly name = "InvalidServerEnvError";

  constructor(details: string) {
    super(
      `Invalid server environment variables. Copy .env.example to .env and fill in the values.\n${details}`,
    );
  }
}

export function parseServerEnv(source: Readonly<Record<string, string | undefined>>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    throw new InvalidServerEnvError(z.prettifyError(result.error));
  }
  return result.data;
}

let cachedServerEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cachedServerEnv ??= parseServerEnv(process.env);
  return cachedServerEnv;
}
