import "server-only";

import { z } from "zod";

export const maxSignInEmailLength = 254;
export const maxSignInPasswordLength = 256;

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
    SIGN_IN_EMAIL: z
      .string()
      .trim()
      .pipe(z.email().max(maxSignInEmailLength))
      .transform((value) => value.toLowerCase()),
    SIGN_IN_PASSWORD: z.string().min(1).max(maxSignInPasswordLength),
  })
  .transform((env) => ({
    fattorApi: {
      baseUrl: env.FATTOR_API_BASE_URL,
    },
    signIn: {
      email: env.SIGN_IN_EMAIL,
      password: env.SIGN_IN_PASSWORD,
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
