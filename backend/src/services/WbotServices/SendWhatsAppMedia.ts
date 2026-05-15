import fs from "fs";
import AppError from "../../errors/AppError";
import Ticket from "../../models/Ticket";
import { whatsappProvider, ProviderMessage } from "../../providers/WhatsApp";
import { logger } from "../../utils/logger";

import formatBody from "../../helpers/Mustache";

interface Request {
  media: Express.Multer.File;
  ticket: Ticket;
  body?: string;
}

const SendWhatsAppMedia = async ({
  media,
  ticket,
  body
}: Request): Promise<ProviderMessage> => {
  if (!ticket.whatsappId) {
    throw new AppError("ERR_TICKET_NO_WHATSAPP");
  }

  const chatId = `${ticket.contact.number}@${ticket.isGroup ? "g" : "c"}.us`;

  const hasBody = body
    ? formatBody(body as string, ticket.contact)
    : undefined;

  const mediaInput = {
    filename: media.filename,
    mimetype: media.mimetype,
    path: media.path
  };

  const mediaOptions = {
    caption: hasBody,
    sendAudioAsVoice: true,
    sendMediaAsDocument:
      media.mimetype.startsWith("image/") &&
      !/^.*\.(jpe?g|png|gif)?$/i.exec(media.filename)
  };

  try {
    const sentMessage = await whatsappProvider.sendMedia(
      ticket.whatsappId,
      chatId,
      mediaInput,
      mediaOptions
    );

    await ticket.update({ lastMessage: body || media.filename });

    return sentMessage;
  } catch (err) {
    throw new AppError("ERR_SENDING_WAPP_MSG");
  } finally {
    try {
      if (fs.existsSync(media.path)) {
        fs.unlinkSync(media.path);
      }
    } catch (cleanupErr) {
      logger.error({ info: "Error cleaning up media file", path: media.path, err: cleanupErr });
    }
  }
};

export default SendWhatsAppMedia;
