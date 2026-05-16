import Whatsapp from "../../models/Whatsapp";
import { getProviderForConnection } from "../../providers/WhatsApp/ProviderFactory";
import { register } from "../../providers/WhatsApp/sessionRegistry";
import { getIO } from "../../libs/socket";
import { logger } from "../../utils/logger";

export const StartWhatsAppSession = async (
  whatsapp: Whatsapp
): Promise<void> => {
  await whatsapp.update({ status: "OPENING" });

  const io = getIO();
  io.emit("whatsappSession", {
    action: "update",
    session: whatsapp
  });

  try {
    // Register the session in the provider registry
    register(whatsapp);

    const provider = getProviderForConnection(whatsapp);
    await provider.init(whatsapp);
  } catch (err) {
    logger.error(err);
  }
};
