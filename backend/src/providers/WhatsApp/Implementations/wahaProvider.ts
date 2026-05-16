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

interface WahaConfig extends ProviderConfig {
  apiUrl: string;
  sessionName?: string;
  webhookUrl?: string;
}

const sessions = new Map<
  number,
  {
    config: WahaConfig;
    sessionName: string;
    isConnected: boolean;
  }
>();

const getSessionData = (whatsappId: number) => {
  const s = sessions.get(whatsappId);
  if (!s) {
    throw new AppError("ERR_WAPP_NOT_INITIALIZED");
  }
  return s;
};

const setConfig = (whatsappId: number, config: WahaConfig): void => {
  const sessionName = config.sessionName || `waha_${whatsappId}`;
  sessions.set(whatsappId, {
    config,
    sessionName,
    isConnected: false
  });
};

const removeSessionData = (whatsappId: number): void => {
  sessions.delete(whatsappId);
};

const buildApiUrl = (
  baseUrl: string,
  sessionName: string,
  endpoint: string
): string => {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const cleanEndpoint = endpoint.replace(/^\/+/, "");
  // Waha v2 uses /api/* for resource endpoints
  return `${cleanBase}/api/${cleanEndpoint}`;
};

const buildSessionUrl = (baseUrl: string, sessionName: string): string => {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  return `${cleanBase}/sessions/${sessionName}`;
};

const init = async (whatsapp: Whatsapp): Promise<void> => {
  const io = getIO();
  const whatsappId = whatsapp.id;
  let config: WahaConfig;

  try {
    config = JSON.parse(whatsapp.providerConfig || "{}") as WahaConfig;
  } catch {
    logger.error({ info: "Invalid Waha provider config", whatsappId });
    throw new AppError("ERR_INVALID_PROVIDER_CONFIG");
  }

  const sessionName = config.sessionName || `waha_${whatsappId}`;
  setConfig(whatsappId, config);

  try {
    const baseUrl = config.apiUrl.replace(/\/+$/, "");

    const existingRes = await httpFetch(
      "GET",
      buildSessionUrl(baseUrl, sessionName),
      {}
    );

    if (existingRes.status === 200) {
      logger.info({ info: "Waha session exists", sessionName, whatsappId });

      const sessionInfo = existingRes.data as any;
      if (sessionInfo?.state === "CONNECTED" || sessionInfo?.status === "CONNECTED") {
        const s = sessions.get(whatsappId);
        if (s) s.isConnected = true;

        await whatsapp.update({ status: "CONNECTED", qrcode: "", retries: 0 });
        io.emit("whatsappSession", { action: "update", session: whatsapp });
        return;
      }
    }
  } catch {
    logger.info({ info: "Waha session not found, creating", whatsappId });
  }

  try {
    const baseUrl = config.apiUrl.replace(/\/+$/, "");

    const startRes = await httpFetch(
      "POST",
      buildSessionUrl(baseUrl, sessionName),
      {},
      {
        name: sessionName,
        webhook: config.webhookUrl
          ? {
              url: config.webhookUrl,
              events: ["message", "message_ack", "state_change"]
            }
          : undefined
      }
    );

    logger.info({
      info: "Waha session start response",
      whatsappId,
      status: startRes.status
    });

    const qrResponse = await httpFetch(
      "GET",
      `${buildSessionUrl(baseUrl, sessionName)}/screenshot`,
      {}
    );

    const qrData = qrResponse.data as any;
    const qrCode =
      qrData?.base64 || qrData?.qr || qrData?.qrcode || "";

    if (qrCode) {
      await whatsapp.update({ qrcode: qrCode, status: "qrcode" });
      io.emit("whatsappSession", { action: "update", session: whatsapp });
    }
  } catch (err: any) {
    logger.error({
      info: "Error initializing Waha session",
      whatsappId,
      error: err.message
    });
    await whatsapp.update({ status: "DISCONNECTED" });
    io.emit("whatsappSession", { action: "update", session: whatsapp });
  }
};

const removeSession = async (whatsappId: number): Promise<void> => {
  const s = sessions.get(whatsappId);
  if (s) {
    try {
      await httpFetch(
        "DELETE",
        buildSessionUrl(s.config.apiUrl, s.sessionName),
        {}
      );
    } catch (err: any) {
      logger.warn({
        info: "Error removing Waha session",
        whatsappId,
        error: err.message
      });
    }
  }
  removeSessionData(whatsappId);
};

const logout = async (sessionId: number): Promise<void> => {
  const s = sessions.get(sessionId);
  if (s) {
    try {
      await httpFetch(
        "DELETE",
        buildSessionUrl(s.config.apiUrl, s.sessionName),
        {}
      );
    } catch (err: any) {
      logger.warn({
        info: "Error logging out Waha session",
        sessionId,
        error: err.message
      });
    }
  }
  removeSessionData(sessionId);
};

const sendMessage = async (
  sessionId: number,
  to: string,
  body: string,
  options?: SendMessageOptions
): Promise<ProviderMessage> => {
  const { config, sessionName } = getSessionData(sessionId);
  const cleanNumber = to.replace(/[^\d@]/g, "").replace(/@c\.us|@s\.whatsapp\.net/g, "");

  const payload: Record<string, any> = {
    session: sessionName,
    chatId: `${cleanNumber}@c.us`,
    text: body
  };

  if (options?.quotedMessageId) {
    payload.reply_to = options.quotedMessageId;
  }

  const response = await httpFetch(
    "POST",
    buildApiUrl(config.apiUrl, sessionName, "sendText"),
    {},
    payload
  );

  const result = response.data as any;

  return {
    id: result?.id || result?.messageId || `waha_${Date.now()}`,
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
  const { config, sessionName } = getSessionData(sessionId);
  const cleanNumber = to.replace(/[^\d@]/g, "").replace(/@c\.us|@s\.whatsapp\.net/g, "");

  const payload: Record<string, any> = {
    session: sessionName,
    chatId: `${cleanNumber}@c.us`,
    file: media.data ? media.data.toString("base64") : "",
    filename: media.filename
  };

  if (options?.caption) {
    payload.caption = options.caption;
  }

  const response = await httpFetch(
    "POST",
    buildApiUrl(config.apiUrl, sessionName, "sendFile"),
    {},
    payload
  );

  const result = response.data as any;

  return {
    id: result?.id || result?.messageId || `waha_${Date.now()}`,
    body: options?.caption || media.filename,
    fromMe: true,
    hasMedia: true,
    type: "document",
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
  const { config, sessionName } = getSessionData(sessionId);
  const cleanNumber = chatId.replace(/[^\d@]/g, "").replace(/@c\.us|@s\.whatsapp\.net/g, "");

  await httpFetch(
    "DELETE",
    `${buildApiUrl(config.apiUrl, sessionName, "messages")}?chatId=${cleanNumber}@c.us&messageId=${messageId}`,
    {}
  );
};

const checkNumber = async (
  sessionId: number,
  number: string
): Promise<string> => {
  const { config, sessionName } = getSessionData(sessionId);
  const cleanNumber = number.replace(/\D/g, "");

  try {
    const response = await httpFetch(
      "POST",
      buildApiUrl(config.apiUrl, sessionName, "checkNumber"),
      {},
      {
        session: sessionName,
        phone: cleanNumber
      }
    );

    const result = response.data as any;
    if (result?.exists) {
      return result?.jid || `${cleanNumber}@c.us`;
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
  const { config, sessionName } = getSessionData(sessionId);
  const cleanNumber = number.replace(/\D/g, "");

  try {
    const response = await httpFetch(
      "GET",
      `${buildApiUrl(config.apiUrl, sessionName, "contacts")}/${cleanNumber}@c.us/profile`,
      {}
    );

    const result = response.data as any;
    return result?.profilePictureUrl || result?.picUrl || "";
  } catch {
    return "";
  }
};

const getContacts = async (
  sessionId: number
): Promise<ProviderContact[]> => {
  const { config, sessionName } = getSessionData(sessionId);

  try {
    const response = await httpFetch(
      "GET",
      `${buildApiUrl(config.apiUrl, sessionName, "contacts")}?session=${sessionName}`,
      {}
    );

    const contacts = response.data as any[];
    if (!Array.isArray(contacts)) return [];

    return contacts.map((contact: any) => ({
      id: contact.id || contact.number || "",
      name: contact.name || contact.pushName || "",
      pushname: contact.pushName || "",
      number: (contact.number || contact.id?.replace(/@c\.us/g, "") || "").replace(/\D/g, ""),
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
  const { config, sessionName } = getSessionData(sessionId);
  const cleanNumber = chatId.replace(/[^\d@]/g, "").replace(/@c\.us|@s\.whatsapp\.net/g, "");

  await httpFetch(
    "POST",
    buildApiUrl(config.apiUrl, sessionName, "readChat"),
    {},
    {
      session: sessionName,
      chatId: `${cleanNumber}@c.us`
    }
  );
};

const fetchChatMessages = async (
  sessionId: number,
  chatId: string,
  limit = 100
): Promise<ProviderMessage[]> => {
  const { config, sessionName } = getSessionData(sessionId);
  const cleanNumber = chatId.replace(/[^\d@]/g, "").replace(/@c\.us|@s\.whatsapp\.net/g, "");

  try {
    const response = await httpFetch(
      "GET",
      `${buildApiUrl(config.apiUrl, sessionName, "messages")}?chatId=${cleanNumber}@c.us&limit=${limit}&session=${sessionName}`,
      {}
    );

    const messages = response.data as any[];
    if (!Array.isArray(messages)) return [];

    return messages.map((msg: any) => ({
      id: msg.id || msg.messageId || "",
      body: msg.body || msg.text || "",
      fromMe: msg.fromMe || false,
      hasMedia: !!msg.hasMedia,
      type: mapWahaType(msg.type),
      timestamp: msg.timestamp
        ? Number(msg.timestamp)
        : Math.floor(Date.now() / 1000),
      from: msg.from || "",
      to: chatId,
      ack: msg.ack !== undefined ? (msg.ack as MessageAck) : 1
    }));
  } catch {
    return [];
  }
};

const mapWahaType = (type: string): MessageType => {
  const typeMap: Record<string, MessageType> = {
    chat: "chat",
    text: "chat",
    image: "image",
    video: "video",
    audio: "audio",
    ptt: "ptt",
    document: "document",
    sticker: "sticker",
    location: "location",
    vcard: "vcard"
  };
  return typeMap[type] || "chat";
};

export const WahaProvider: WhatsappProvider = {
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