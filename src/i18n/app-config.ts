import type { Locale } from "@/lib/locale";

import type messages from "./messages/en.json";

declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
