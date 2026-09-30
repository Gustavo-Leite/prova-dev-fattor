import "server-only";

import { getServerEnv, InvalidServerEnvError } from "@/infra/env";

export function assertServerEnvOnStartup(): void {
  try {
    getServerEnv();
  } catch (error) {
    if (!(error instanceof InvalidServerEnvError)) {
      throw error;
    }
    console.error(error.message);
    process.exit(1);
  }
}
