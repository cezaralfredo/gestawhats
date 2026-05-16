import { getIO } from "../../../libs/socket";
import Whatsapp from "../../../models/Whatsapp";
import AppError from "../../../errors/AppError";
import { logger } from "../../../utils/logger";
import { httpFetch } from "../../../utils/httpFetch";
import { WhatsappProvider, ProviderConfig } from "../whatsappProvider";
import {
  ProviderMessage,
  ProviderMediaInput,
  SendMessageOptions,
  SendMediaOptions,
  ProviderContact,
  MessageAck,
  MessageType
} from "../types";

interface InstanceInfo {
  instance?: {
    instanceName: string;
    status: string;
    [key: string]: any;
  };
  [key: string]: any;
}

interface EvolutionConfig extends ProviderConfig {
  apiUrl: string;
  apiToken: string;
  instanceName?: string;
  webhookUrl?: string;
  webhookGlobal?: boolean;
}

const session = new Map<
  number,
  {
    config: EvolutionConfig;
    instanceName: string;
  }
>();

const getSessionConfig = (whatsappId: number): EvolutionConfig => {
  const s = session.get(whatsappId);
  if (!s) {
    throw new AppError("ERR_WAPP_NOT_INITIALIZED");
  }
  return s.config;
};

const getInstanceName = (whatsappId: number): string => {
  const s = session.get(whatsappId);
  if (!s) {
    throw new AppError("ERR_WAPP_NOT_INITIALIZED");
  }
  return s.instanceName;
};

const setConfig = (whatsappId: number, config: EvolutionConfig): void => {
  const instanceName = config.instanceName || `instance_${whatsappId}`;
  session.set(whatsappId, { config, instanceName });
};

const removeSessionConfig = (whatsappId: number): void => {
  session.delete(whatsappId);
};

const buildUrl = (
  baseUrl: string,
  instanceName: string,
  path: string
): string => {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  return `${cleanBase}/${path.replace(/^\/+/, "").replace("{instance}", instanceName)}`;
};

const init = async (whatsapp: Whatsapp): Promise<void> => {
  const io = getIO();
  const whatsappId = whatsapp.id;
  const rawConfig = whatsapp.providerConfig || "{}";
  let config: EvolutionConfig;

  try {
    config = JSON.parse(rawConfig) as EvolutionConfig;
  } catch {
    logger.error({ info: "Invalid Evolution provider config", whatsappId });
    throw new AppError("ERR_INVALID_PROVIDER_CONFIG");
  }

  const instanceName =
    config.instanceName || `instance_${whatsappId}`;
  setConfig(whatsappId, { ...config, instanceName });

  const baseUrl = config.apiUrl.replace(/\/+$/, "");

  try {
    const response = await httpFetch(
      "GET",
      `${baseUrl}/instance/fetchInstances`,
      { apikey: config.apiToken }
    );

    const instances = response.data || {};
    const instanceExists = Object.values(instances).some(
      (inst: any) =>
        inst?.instance?.instanceName === instanceName ||
        inst?.instanceName === instanceName
    );

    if (instanceExists) {
      logger.info({ info: "Evolution instance exists, reconnecting", instanceName, whatsappId });
    } else {
      logger.info({ info: "Creating new Evolution instance", instanceName, whatsappId });

      await httpFetch(
        "POST",
        `${baseUrl}/instance/create`,
        { apikey: config.apiToken },
        {
          instanceName,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
          webhook: config.webhookUrl
            ? {
                url: config.webhookUrl,
                enabled: true,
                global: config.webhookGlobal || false
              }
            : undefined
        }
      );
    }

    const qrResponse = await httpFetch(
      "GET",
      `${baseUrl}/instance/connect/${instanceName}`,
      { apikey: config.apiToken }
    );

    const qrData = qrResponse.data as any;
    const qrCode = qrData?.base64 || qrData?.qrcode || qrData?.qr || "";

    if (qrCode) {
      await whatsapp.update({ qrcode: qrCode, status: "qrcode" });
      io.emit("whatsappSession", { action: "update", session: whatsapp });
    } else {
      const statusResponse = await httpFetch(
        "GET",
        `${baseUrl}/instance/connectionState/${instanceName}`,
        { apikey: config.apiToken }
      );

      const stateData = statusResponse.data as any;
      const connectionState = stateData?.state || stateData?.instance?.status || "OPENING";

      if (connectionState === "open") {
        await whatsapp.update({ status: "CONNECTED", qrcode: "", retries: 0 });
      } else {
        await whatsapp.update({ status: "OPENING" });
      }

      io.emit("whatsappSession", { action: "update", session: whatsapp });
    }
  } catch (err: any) {
    logger.error({ info: "Error initializing Evolution session", whatsappId, error: err.message });
    await whatsapp.update({ status: "DISCONNECTED" });
    io.emit("whatsappSession", { action: "update", session: whatsapp });
  }
};

const removeSession = async (whatsappId: number): Promise<void> => {
  const config = session.get(whatsappId)?.config;
  const instanceName = getInstanceName(whatsappId);

  if (config) {
    try {
      const baseUrl = config.apiUrl.replace(/\/+$/, "");
      await httpFetch(
        "DELETE",
        `${baseUrl}/instance/delete/${instanceName}`,
        { apikey: config.apiToken }
      );
    } catch (err: any) {
      logger.warn({ info: "Error removing Evolution instance", whatsappId, error: err.message });
    }
  }

  removeSessionConfig(whatsappId);
};

const logout = async (sessionId: number): Promise<void> => {
  const config = session.get(sessionId)?.config;
  const instanceName = getInstanceName(sessionId);

  if (config) {
    try {
      const baseUrl = config.apiUrl.replace(/\/+$/, "");
      await httpFetch(
        "POST",
        `${baseUrl}/instance/logout/${instanceName}`,
        { apikey: config.apiToken }
      );
    } catch (err: any) {
      logger.warn({ info: "Error logging out Evolution instance", sessionId, error: err.message });
    }
  }

  removeSessionConfig(sessionId);
};

const sendMessage = async (
  sessionId: number,
  to: string,
  body: string,
  options?: SendMessageOptions
): Promise<ProviderMessage> => {
  const config = getSessionConfig(sessionId);
  const instanceName = getInstanceName(sessionId);
  const cleanNumber = to.replace(/[^\d@]/g, "").replace(/@c\.us|@s\.whatsapp\.net/g, "");

  const payload: Record<string, any> = {
    number: cleanNumber,
    text: body,
    delay: 1000
  };

  if (options?.quotedMessageId) {
    payload.quotedMsgId = options.quotedMessageId;
  }

  if (options?.linkPreview !== undefined) {
    payload.linkPreview = options.linkPreview;
  }

  const response = await httpFetch(
    "POST",
    buildUrl(config.apiUrl, instanceName, "message/sendText/{instance}"),
    { apikey: config.apiToken },
    payload
  );

  const result = response.data as any;

  return {
    id: result?.key?.id || result?.messageId || `ev_${Date.now()}`,
    body,
    fromMe: true,
    hasMedia: false,
    type: "chat",
    timestamp: Math.floor(Date.now() / 1000),
    from: "",
    to: cleanNumber,
    ack: 1
  };
};

const sendMedia = async (
  sessionId: number,
  to: string,
  media: ProviderMediaInput,
  options?: SendMediaOptions
): Promise<ProviderMessage> => {
  const config = getSessionConfig(sessionId);
  const instanceName = getInstanceName(sessionId);
  const cleanNumber = to.replace(/[^\d@]/g, "").replace(/@c\.us|@s\.whatsapp\.net/g, "");

  const payload: Record<string, any> = {
    number: cleanNumber,
    media: media.data ? media.data.toString("base64") : "",
    fileName: media.filename,
    mimetype: media.mimetype,
    delay: 1000
  };

  if (options?.caption) {
    payload.caption = options.caption;
  }

  if (options?.quotedMessageId) {
    payload.quotedMsgId = options.quotedMessageId;
  }

  const response = await httpFetch(
    "POST",
    buildUrl(config.apiUrl, instanceName, "message/sendMedia/{instance}"),
    { apikey: config.apiToken },
    payload
  );

  const result = response.data as any;

  const mediaType: MessageType = media.mimetype.startsWith("image/")
    ? "image"
    : media.mimetype.startsWith("video/")
      ? "video"
      : media.mimetype.startsWith("audio/")
        ? (options?.sendAudioAsVoice ? "ptt" : "audio")
        : "document";

  return {
    id: result?.key?.id || result?.messageId || `ev_${Date.now()}`,
    body: options?.caption || media.filename,
    fromMe: true,
    hasMedia: true,
    type: mediaType,
    timestamp: Math.floor(Date.now() / 1000),
    from: "",
    to: cleanNumber,
    ack: 1
  };
};

const deleteMessage = async (
  sessionId: number,
  chatId: string,
  messageId: string,
  fromMe: boolean
): Promise<void> => {
  const config = getSessionConfig(sessionId);
  const instanceName = getInstanceName(sessionId);

  await httpFetch(
    "POST",
    buildUrl(config.apiUrl, instanceName, "message/delete/{instance}"),
    { apikey: config.apiToken },
    {
      messageId,
      chatId,
      fromMe
    }
  );
};

const checkNumber = async (
  sessionId: number,
  number: string
): Promise<string> => {
  const config = getSessionConfig(sessionId);
  const instanceName = getInstanceName(sessionId);
  const cleanNumber = number.replace(/\D/g, "");

  try {
    const response = await httpFetch(
      "GET",
      buildUrl(
        config.apiUrl,
        instanceName,
        `chat/checkNumber/${encodeURIComponent(cleanNumber)}`
      ),
      { apikey: config.apiToken }
    );

    const result = response.data as any;
    if (result?.exists || result?.numberExists) {
      return result?.jid || `${cleanNumber}@s.whatsapp.net`;
    }

    return "";
  } catch {
    return "";
  }
};

const getProfilePicUrl = async (
  sessionId: number,
  number: string
): Promise<string> => {
  const config = getSessionConfig(sessionId);
  const instanceName = getInstanceName(sessionId);
  const cleanNumber = number.replace(/\D/g, "");

  try {
    const response = await httpFetch(
      "GET",
      buildUrl(
        config.apiUrl,
        instanceName,
        `chat/getProfilePic/${encodeURIComponent(cleanNumber)}`
      ),
      { apikey: config.apiToken }
    );

    const result = response.data as any;
    return result?.url || result?.profilePicUrl || "";
  } catch {
    return "";
  }
};

const getContacts = async (
  sessionId: number
): Promise<ProviderContact[]> => {
  const config = getSessionConfig(sessionId);
  const instanceName = getInstanceName(sessionId);

  try {
    const response = await httpFetch(
      "GET",
      buildUrl(config.apiUrl, instanceName, "contact/getContacts/{instance}"),
      { apikey: config.apiToken }
    );

    const contacts = response.data as any[];
    if (!Array.isArray(contacts)) return [];

    return contacts.map((contact: any) => ({
      id: contact.id || contact.number || "",
      name: contact.name || contact.pushName || "",
      pushname: contact.pushName || "",
      number: (contact.number || "").replace(/\D/g, ""),
      isGroup: contact.isGroup || false
    }));
  } catch {
    return [];
  }
};

const sendSeen = async (
  sessionId: number,
  chatId: string
): Promise<void> => {
  const config = getSessionConfig(sessionId);
  const instanceName = getInstanceName(sessionId);
  const cleanNumber = chatId.replace(/[^\d@]/g, "").replace(/@c\.us|@s\.whatsapp\.net/g, "");

  await httpFetch(
    "POST",
    buildUrl(config.apiUrl, instanceName, "chat/sendSeen/{instance}"),
    { apikey: config.apiToken },
    { number: cleanNumber }
  );
};

const fetchChatMessages = async (
  sessionId: number,
  chatId: string,
  limit = 100
): Promise<ProviderMessage[]> => {
  const config = getSessionConfig(sessionId);
  const instanceName = getInstanceName(sessionId);
  const cleanNumber = chatId.replace(/[^\d@]/g, "").replace(/@c\.us|@s\.whatsapp\.net/g, "");

  try {
    const response = await httpFetch(
      "GET",
      buildUrl(
        config.apiUrl,
        instanceName,
        `chat/fetchMessages/${encodeURIComponent(cleanNumber)}?limit=${limit}`
      ),
      { apikey: config.apiToken }
    );

    const messages = response.data as any[];
    if (!Array.isArray(messages)) return [];

    return messages.map((msg: any) => ({
      id: msg.key?.id || msg.messageId || "",
      body: msg.body || msg.text || "",
      fromMe: msg.key?.fromMe || msg.fromMe || false,
      hasMedia: msg.hasMedia || !!msg.mediaUrl,
      type: mapEvolutionType(msg.type || msg.messageType),
      timestamp: msg.messageTimestamp
        ? Number(msg.messageTimestamp)
        : Math.floor(Date.now() / 1000),
      from: msg.key?.remoteJid || msg.from || "",
      to: chatId,
      ack: msg.ack !== undefined ? (msg.ack as MessageAck) : 1
    }));
  } catch {
    return [];
  }
};

const mapEvolutionType = (type: string): MessageType => {
  const typeMap: Record<string, MessageType> = {
    conversation: "chat",
    extendedTextMessage: "chat",
    imageMessage: "image",
    videoMessage: "video",
    audioMessage: "audio",
    ptt: "ptt",
    documentMessage: "document",
    stickerMessage: "sticker",
    locationMessage: "location",
    contactMessage: "vcard"
  };
  return typeMap[type] || "chat";
};

export const EvolutionProvider: WhatsappProvider = {
  init,
  removeSession,
  logout,
  sendMessage,
  sendMedia,
  deleteMessage,
  checkNumber,
  getProfilePicUrl,
  getContacts,
  sendSeen,
  fetchChatMessages
};