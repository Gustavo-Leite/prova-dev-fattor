import type { InvoiceStatusGateway } from "@/application/remittance/invoice-status-gateway";
import { createRemittanceUploadHandler } from "@/app/api/remittances/handle-remittance-upload";
import { getServerEnv } from "@/infra/env";
import { createFattorStatusGateway } from "@/infra/fattor/fattor-status-gateway";

export const maxDuration = 30;

let gateway: InvoiceStatusGateway | undefined;

function getGateway(): InvoiceStatusGateway {
  gateway ??= createFattorStatusGateway(getServerEnv().fattorApi);
  return gateway;
}

export const POST = createRemittanceUploadHandler({ getGateway });
