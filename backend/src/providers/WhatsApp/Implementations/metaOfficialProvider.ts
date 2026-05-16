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

interface MetaConfig extends ProviderConfig {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  webhookSecret?: string;
  apiVersion?: string;
  recipientPhoneNumberId?: string;
}

const GRAPH_API_BASE = "https://graph.facebook.com";
const DEFAULT_API_VERSION = "v20.0";

const sessions = new Map<
  number,
  {
    config: MetaConfig;
  }
>();

const getSessionMeta = (whatsappId: number) => {
  const s = sessions.get(whatsappId);
  if (!s) {
    throw new AppError("ERR_WAPP_NOT_INITIALIZED");
  }
  return s;
};

const setConfig = (whatsappId: number, config: MetaConfig): void => {
  sessions.set(whatsappId, { config });
};

const removeSessionMeta = (whatsappId: number): void => {
  sessions.delete(whatsappId);
};

const getGraphUrl = (
  config: MetaConfig,
  path: string
): string => {
  const version = config.apiVersion || DEFAULT_API_VERSION;
  const base = `${GRAPH_API_BASE}/${version}`;
  return `${base}/${path}`;
};

const graphRequest = async (
  config: MetaConfig,
  method: string,
  path: string,
  body?: any
) => {
  return httpFetch(
    method,
    getGraphUrl(config, path),
    {
      Authorization: `Bearer ${config.accessToken}`
    },
    body
  );
};

const markMessageAsRead = async (config: MetaConfig, messageId: string) => {
  try {
    await graphRequest(config, "POST", `${config.phoneNumberId}/messages`, {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId
    });
  } catch (err: any) {
    logger.warn({
      info: "Error marking message as read",
      messageId,
      error: err.message
    });
  }
};

const init = async (whatsapp: Whatsapp): Promise<void> => {
  const io = getIO();
  const whatsappId = whatsapp.id;
  let config: MetaConfig;

  try {
    config = JSON.parse(whatsapp.providerConfig || "{}") as MetaConfig;
  } catch {
    logger.error({ info: "Invalid Meta provider config", whatsappId });
    throw new AppError("ERR_INVALID_PROVIDER_CONFIG");
  }

  if (!config.accessToken || !config.phoneNumberId || !config.businessAccountId) {
    logger.error({
      info: "Missing required Meta provider config fields",
      whatsappId,
      hasToken: !!config.accessToken,
      hasPhoneId: !!config.phoneNumberId,
      hasBusinessId: !!config.businessAccountId
    });
    throw new AppError("ERR_INVALID_PROVIDER_CONFIG");
  }

  setConfig(whatsappId, config);

  try {
    const response = await graphRequest(
      config,
      "GET",
      `${config.phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating`
    );

    const phoneInfo = response.data as any;

    if (response.status === 200 && phoneInfo?.id) {
      logger.info({
        info: "Meta WhatsApp Cloud API connected successfully",
        whatsappId,
        phoneNumber: phoneInfo.display_phone_number,
        verifiedName: phoneInfo.verified_name
      });

      await whatsapp.update({
        status: "CONNECTED",
        qrcode: "",
        retries: 0
      });
    } else {
      logger.error({
        info: "Failed to verify Meta phone number",
        whatsappId,
        response: phoneInfo
      });
      await whatsapp.update({ status: "DISCONNECTED" });
    }

    io.emit("whatsappSession", { action: "update", session: whatsapp });
  } catch (err: any) {
    logger.error({
      info: "Error initializing Meta provider",
      whatsappId,
      error: err.message
    });
    await whatsapp.update({ status: "DISCONNECTED" });
    io.emit("whatsappSession", { action: "update", session: whatsapp });
  }
};

const removeSession = async (whatsappId: number): Promise<void> => {
  removeSessionMeta(whatsappId);
};

const logout = async (sessionId: number): Promise<void> => {
  removeSessionMeta(sessionId);

  const whatsapp = await Whatsapp.findByPk(sessionId);
  if (whatsapp) {
    await whatsapp.update({
      status: "DISCONNECTED",
      qrcode: "",
      retries: 0
    });

    const updatedWhatsapp = await Whatsapp.findByPk(sessionId);
    if (updatedWhatsapp) {
      getIO().emit("whatsappSession", {
        action: "update",
        session: updatedWhatsapp
      });
    }
  }
};

const sendMessage = async (
  sessionId: number,
  to: string,
  body: string,
  options?: SendMessageOptions
): Promise<ProviderMessage> => {
  const { config } = getSessionMeta(sessionId);
  const cleanNumber = to.replace(/[^\d]/g, "");

  const payload: Record<string, any> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: cleanNumber,
    type: "text",
    text: {
      preview_url: options?.linkPreview ?? true,
      body
    }
  };

  const response = await graphRequest(
    config,
    "POST",
    `${config.phoneNumberId}/messages`,
    payload
  );

  const result = response.data as any;

  const messageId = result?.messages?.[0]?.id || `meta_${Date.now()}`;

  return {
    id: messageId,
    body,
    fromMe: true,
    hasMedia: false,
    type: "chat",
    timestamp: Math.floor(Date.now() / 1000),
    from: config.phoneNumberId,
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
  const { config } = getSessionMeta(sessionId);
  const cleanNumber = to.replace(/[^\d]/g, "");

  let mediaType: "image" | "audio" | "document" | "video" | "sticker";
  let mediaObject: Record<string, any> = {};

  if (media.mimetype.startsWith("image/")) {
    mediaType = "image";
    mediaObject = {
      image: {
        caption: options?.caption || "",
        link: media.path || ""
      }
    };
  } else if (media.mimetype.startsWith("video/")) {
    mediaType = "video";
    mediaObject = {
      video: {
        caption: options?.caption || "",
        link: media.path || ""
      }
    };
  } else if (media.mimetype.startsWith("audio/")) {
    mediaType = "audio";
    mediaObject = {
      audio: {
        link: media.path || ""
      }
    };
  } else if (media.mimetype === "image/webp") {
    mediaType = "sticker";
    mediaObject = {
      sticker: {
        link: media.path || ""
      }
    };
  } else {
    mediaType = "document";
    mediaObject = {
      document: {
        caption: options?.caption || "",
        filename: media.filename,
        link: media.path || ""
      }
    };
  }

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: cleanNumber,
    type: mediaType,
    ...mediaObject
  };

  const response = await graphRequest(
    config,
    "POST",
    `${config.phoneNumberId}/messages`,
    payload
  );

  const result = response.data as any;
  const messageId = result?.messages?.[0]?.id || `meta_${Date.now()}`;

  const mappedType: MessageType =
    mediaType === "audio" && options?.sendAudioAsVoice ? "ptt" : (mediaType as MessageType);

  return {
    id: messageId,
    body: options?.caption || media.filename,
    fromMe: true,
    hasMedia: true,
    type: mappedType,
    timestamp: Math.floor(Date.now() / 1000),
    from: config.phoneNumberId,
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
  const { config } = getSessionMeta(sessionId);

  try {
    await graphRequest(config, "DELETE", `${config.phoneNumberId}/messages`, {
      message_id: messageId
    });
  } catch (err: any) {
    logger.warn({
      info: "Error deleting Meta message",
      messageId,
      error: err.message
    });
  }
};

const checkNumber = async (
  sessionId: number,
  number: string
): Promise<string> => {
  const { config } = getSessionMeta(sessionId);
  const cleanNumber = number.replace(/\D/g, "");

  try {
    const response = await graphRequest(
      config,
      "GET",
      `${config.phoneNumberId}/contacts?fields=input,wa_id`
    );

    const result = response.data as any;
    if (result?.data?.length > 0) {
      return cleanNumber;
    }
    return "";
  } catch {
    return cleanNumber;
  }
};

const getProfilePicUrl = async (
  sessionId: number,
  number: string
): Promise<string> => {
  const { config } = getSessionMeta(sessionId);

  try {
    const response = await graphRequest(
      config,
      "GET",
      `${config.phoneNumberId}/contacts/${number.replace(/\D/g, "")}?fields=profile_pic_url`
    );

    const result = response.data as any;
    return result?.profile_pic_url || "";
  } catch {
    return "";
  }
};

const getContacts = async (
  sessionId: number
): Promise<ProviderContact[]> => {
  const { config } = getSessionMeta(sessionId);

  try {
    const response = await graphRequest(
      config,
      "GET",
      `${config.phoneNumberId}/contacts?fields=id,name,profile_pic_url&limit=100`
    );

    const result = response.data as any;
    const contactsList = result?.data || [];

    return contactsList.map((contact: any) => ({
      id: contact.wa_id || contact.id || "",
      name: contact.name?.formatted_name || contact.name || "",
      number: contact.wa_id || contact.id || "",
      isGroup: false
    }));
  } catch {
    return [];
  }
};

const sendSeen = async (
  sessionId: number,
  chatId: string
): Promise<void> => {
  const { config } = getSessionMeta(sessionId);
  const cleanNumber = chatId.replace(/[^\d]/g, "");

  try {
    await graphRequest(config, "POST", `${config.phoneNumberId}/messages`, {
      messaging_product: "whatsapp",
      to: cleanNumber,
      type: "action",
      action: "mark_read"
    });
  } catch (err: any) {
    logger.warn({
      info: "Error sending seen in Meta",
      chatId,
      error: err.message
    });
  }
};

const fetchChatMessages = async (
  sessionId: number,
  chatId: string,
  limit = 100
): Promise<ProviderMessage[]> => {
  const { config } = getSessionMeta(sessionId);
  const cleanNumber = chatId.replace(/[^\d]/g, "");

  try {
    const response = await graphRequest(
      config,
      "GET",
      `${config.phoneNumberId}/messages?limit=${limit}`
    );

    const result = response.data as any;
    const messages = result?.data || [];

    return messages
      .filter((msg: any) => msg.from === cleanNumber || msg.to === cleanNumber)
      .map((msg: any) => ({
        id: msg.id || "",
        body: msg.text?.body || msg.caption || "",
        fromMe: msg.direction === "outbound",
        hasMedia: !!(
          msg.image ||
          msg.video ||
          msg.audio ||
          msg.document ||
          msg.sticker
        ),
        type: mapMetaType(msg),
        timestamp: msg.timestamp
          ? Number(msg.timestamp)
          : Math.floor(Date.now() / 1000),
        from: msg.from || "",
        to: msg.to || chatId,
        ack: msg.status === "read" ? 3 : msg.status === "delivered" ? 2 : 1
      }));
  } catch {
    return [];
  }
};

const mapMetaType = (msg: any): MessageType => {
  if (msg.image) return "image";
  if (msg.video) return "video";
  if (msg.audio) return msg.audio.voice ? "ptt" : "audio";
  if (msg.document) return "document";
  if (msg.sticker) return "sticker";
  if (msg.location) return "location";
  if (msg.contacts) return "vcard";
  return "chat";
};

const handleWebhookMessage = (
  whatsappId: number,
  payload: any
): any => {
  const handleMessage = require("../../../handlers/handleWhatsappEvents").handleMessage;

  const entry = payload?.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;
  const messages = value?.messages;

  if (!messages || messages.length === 0) return null;

  return messages.map((msg: any) => {
    const from = msg.from || "";
    const messageType = mapMetaType(msg);

    const messagePayload = {
      id: msg.id || "",
      body: msg.text?.body || msg.caption || "",
      fromMe: false,
      hasMedia: !!(
        msg.image ||
        msg.video ||
        msg.audio ||
        msg.document ||
        msg.sticker
      ),
      type: messageType,
      timestamp: msg.timestamp
        ? Number(msg.timestamp)
        : Math.floor(Date.now() / 1000),
      from,
      to: value?.metadata?.display_phone_number || "",
      ack: 1 as MessageAck
    };

    const contactPayload = {
      name:
        value?.contacts?.[0]?.profile?.name ||
        value?.contacts?.[0]?.name ||
        from,
      number: from,
      isGroup: false
    };

    const mediaPayload = extractMedia(msg);

    const contextPayload = {
      whatsappId,
      unreadMessages: 1
    };

    handleMessage(messagePayload, contactPayload as any, contextPayload, mediaPayload as any);

    markMessageAsRead(
      sessions.get(whatsappId)?.config!,
      msg.id
    );

    return { messagePayload, contactPayload, contextPayload, mediaPayload };
  });
};

const extractMedia = (msg: any): any => {
  if (msg.image) {
    return {
      filename: msg.image.id || "image.jpg",
      mimetype: msg.image.mime_type || "image/jpeg",
      data: msg.image.id || ""
    };
  }
  if (msg.video) {
    return {
      filename: msg.video.id || "video.mp4",
      mimetype: msg.video.mime_type || "video/mp4",
      data: msg.video.id || ""
    };
  }
  if (msg.audio) {
    return {
      filename: msg.audio.id || "audio.ogg",
      mimetype: msg.audio.mime_type || "audio/ogg",
      data: msg.audio.id || ""
    };
  }
  if (msg.document) {
    return {
      filename: msg.document.filename || msg.document.id || "document.pdf",
      mimetype: msg.document.mime_type || "application/octet-stream",
      data: msg.document.id || ""
    };
  }
  return undefined;
};

export const MetaOfficialProvider: WhatsappProvider = {
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