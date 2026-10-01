import type { NextRequest } from "next/server";

import { createRemittanceUploadHandler } from "@/app/api/remittances/handle-remittance-upload";
import { getServerEnv } from "@/infra/env";
import { createFattorStatusGateway } from "@/infra/fattor/fattor-status-gateway";
import { openSessionCookie, sessionCookieName } from "@/lib/session-cookie";

export const maxDuration = 30;

const handleRemittanceUpload = createRemittanceUploadHandler({
  readSession: (sessionCookie) => openSessionCookie(sessionCookie, getServerEnv().sessionSecret),
  getGateway: (token) =>
    createFattorStatusGateway({ baseUrl: getServerEnv().fattorApi.baseUrl, token }),
});

export async function POST(request: NextRequest): Promise<Response> {
  return handleRemittanceUpload(request, request.cookies.get(sessionCookieName)?.value);
}
