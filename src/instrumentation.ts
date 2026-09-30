export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertServerEnvOnStartup } = await import("@/infra/startup");
    assertServerEnvOnStartup();
  }
}
