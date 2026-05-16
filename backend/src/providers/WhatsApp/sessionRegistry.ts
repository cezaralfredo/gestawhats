import Whatsapp from "../../models/Whatsapp";
import { getProvider } from "./ProviderFactory";
import { WhatsappProvider, ProviderConfig } from "./whatsappProvider";
import { parseProviderConfig } from "./ProviderFactory";

interface SessionInfo {
  providerName: string;
  provider: WhatsappProvider;
  config: Record<string, any>;
}

const registry = new Map<number, SessionInfo>();

const register = (whatsapp: Whatsapp): SessionInfo => {
  const providerName = whatsapp.provider || "wwebjs";
  const provider = getProvider(providerName);
  const config = parseProviderConfig(whatsapp.providerConfig);

  const info: SessionInfo = { providerName, provider, config };
  registry.set(whatsapp.id, info);

  // For HTTP-based providers, set config
  if (providerName === "evolution" || providerName === "waha" || providerName === "meta") {
    (provider as any).setConfig(whatsapp.id, config);
  }

  return info;
};

const unregister = (whatsappId: number): void => {
  const info = registry.get(whatsappId);
  if (info) {
    const { providerName, provider } = info;
    if (providerName === "evolution" || providerName === "waha" || providerName === "meta") {
      (provider as any).removeSessionConfig?.(whatsappId);
    }
  }
  registry.delete(whatsappId);
};

const getInfo = (whatsappId: number): SessionInfo | undefined => {
  return registry.get(whatsappId);
};

const getInfoOrLookup = async (whatsappId: number): Promise<SessionInfo> => {
  const existing = registry.get(whatsappId);
  if (existing) return existing;

  const whatsapp = await Whatsapp.findByPk(whatsappId);
  if (!whatsapp) {
    throw new Error(`WhatsApp connection #${whatsappId} not found`);
  }

  return register(whatsapp);
};

const resolveProvider = (whatsappId: number): WhatsappProvider => {
  const info = registry.get(whatsappId);
  if (info) return info.provider;

  // Fallback to global provider
  const { whatsappProvider } = require("./whatsappProvider");
  return whatsappProvider;
};

export { register, unregister, getInfo, getInfoOrLookup, resolveProvider, SessionInfo };