/**
 * Whether developer tools exist in this build (lib/devTools). Kept in its own
 * module so the notification code can check it without importing devTools,
 * which imports the notification code.
 */
import config from "./config";
import { devToolsAvailable } from "./orderAlertRules";

/** False in every release build except an EAS "preview" one. */
export const DEV_TOOLS_AVAILABLE: boolean = devToolsAvailable(config.ENVIRONMENT, typeof __DEV__ !== "undefined" && __DEV__);
