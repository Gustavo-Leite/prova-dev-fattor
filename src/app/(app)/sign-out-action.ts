"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { sessionCookieName, sessionCookiePath } from "@/lib/session-cookie";

export async function signOut(): Promise<void> {
  (await cookies()).delete({ name: sessionCookieName, path: sessionCookiePath });
  redirect("/entrar");
}
