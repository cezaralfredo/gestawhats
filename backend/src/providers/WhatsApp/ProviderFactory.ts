import Whatsapp from "../../models/Whatsapp";
import { WhatsappProvider } from "./whatsappProvider";
import { WhatsappWebJsProvider } from "./Implementations/wwebjs";
import { WhaileysProvider } from "./Implementations/whaileys";
import { EvolutionProvider } from "./Implementations/evolutionProvider";
import { WahaProvider } from "./Implementations/wahaProvider";
import { MetaOfficialProvider } from "./Implementations/metaOfficialProvider";

const providersMap: Record<string, WhatsappProvider> = {
  wwebjs: WhatsappWebJsProvider,
  whaileys: WhaileysProvider,
  evolution: EvolutionProvider,
  waha: WahaProvider,
  meta: MetaOfficialProvider
};

const getProvider = (providerName: string): WhatsappProvider => {
  const provider = providersMap[providerName];
  if (!provider) {
    throw new Error(`Unknown WhatsApp provider: ${providerName}`);
  }
  return provider;
};

const getProviderForConnection = (whatsapp: Whatsapp): WhatsappProvider => {
  const providerName = whatsapp.provider || "wwebjs";
  const provider = getProvider(providerName);

  if (
    providerName === "evolution" ||
    providerName === "waha" ||
    providerName === "meta"
  ) {
    const config = parseProviderConfig(whatsapp.providerConfig);
    (provider as any).setConfig(whatsapp.id, config);
  }

  return provider;
};

const parseProviderConfig = (
  configString: string | null | undefined
): Record<string, any> => {
  if (!configString) return {};
  try {
    return JSON.parse(configString);
  } catch {
    return {};
  }
};

const validateProviderConfig = (
  provider: string,
  config: Record<string, any>
): string[] => {
  const errors: string[] = [];
  const requiredFields: Record<string, string[]> = {
    evolution: ["apiUrl", "apiToken"],
    waha: ["apiUrl"],
    meta: ["phoneNumberId", "accessToken", "businessAccountId"]
  };

  const fields = requiredFields[provider] || [];
  for (const field of fields) {
    if (!config[field]) {
      errors.push(`Field "${field}" is required for provider "${provider}"`);
    }
  }

  return errors;
};

export {
  getProvider,
  getProviderForConnection,
  parseProviderConfig,
  validateProviderConfig,
  providersMap
};