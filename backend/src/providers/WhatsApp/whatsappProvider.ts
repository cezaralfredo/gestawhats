import Whatsapp from "../../models/Whatsapp";
import {
  ProviderMessage,
  ProviderMediaInput,
  ProviderContact,
  SendMessageOptions,
  SendMediaOptions
} from "./types";
import { WhatsappWebJsProvider } from "./Implementations/wwebjs";
import { WhaileysProvider } from "./Implementations/whaileys";
import { resolveProvider } from "./sessionRegistry";

export interface ProviderConfig {
  apiUrl?: string;
  apiToken?: string;
  accessToken?: string;
  phoneNumberId?: string;
  businessAccountId?: string;
  webhookSecret?: string;
  webhookUrl?: string;
  [key: string]: any;
}

export interface WhatsappProvider {
  init(whatsapp: Whatsapp): Promise<void>;
  removeSession(whatsappId: number): Promise<void>;
  logout(sessionId: number): Promise<void>;
  sendMessage(
    sessionId: number,
    to: string,
    body: string,
    options?: SendMessageOptions
  ): Promise<ProviderMessage>;
  sendMedia(
    sessionId: number,
    to: string,
    media: ProviderMediaInput,
    options?: SendMediaOptions
  ): Promise<ProviderMessage>;
  deleteMessage(
    sessionId: number,
    chatId: string,
    messageId: string,
    fromMe: boolean
  ): Promise<void>;
  checkNumber(sessionId: number, number: string): Promise<string>;
  getProfilePicUrl(sessionId: number, number: string): Promise<string>;
  getContacts(sessionId: number): Promise<ProviderContact[]>;
  sendSeen(sessionId: number, chatId: string): Promise<void>;
  fetchChatMessages(
    sessionId: number,
    chatId: string,
    limit: number
  ): Promise<ProviderMessage[]>;
}

const provider = process.env.WHATSAPP_PROVIDER || "wwebjs";

const providersMap: Record<string, WhatsappProvider> = {
  wwebjs: WhatsappWebJsProvider,
  whaileys: WhaileysProvider
};

const whatsappProvider = new Proxy(providersMap[provider] as WhatsappProvider, {
  get(target, prop: string | symbol) {
    const method = (target as any)[prop];
    if (typeof method !== "function") return method;

    return function (this: any, ...args: any[]) {
      const sessionId = args[0];
      let resolvedProvider: WhatsappProvider | undefined;

      if (typeof sessionId === "number") {
        try {
          resolvedProvider = resolveProvider(sessionId);
        } catch {
          resolvedProvider = providersMap[provider];
        }
      } else {
        // For init(whatsapp) - first arg is a Whatsapp model instance
        if (args[0] && typeof args[0] === "object" && args[0].provider) {
          const { getProvider } = require("./ProviderFactory");
          resolvedProvider = getProvider(args[0].provider);
        }
      }

      if (!resolvedProvider) {
        resolvedProvider = providersMap[provider];
      }

      return (resolvedProvider as any)[prop](...args);
    };
  }
});

export { whatsappProvider };
