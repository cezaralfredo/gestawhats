import gracefulShutdown from "http-graceful-shutdown";
import app from "./app";
import { initIO, getIO } from "./libs/socket";
import { logger } from "./utils/logger";
import { initRedis, getRedisClient } from "./libs/redisStore";
import { StartAllWhatsAppsSessions } from "./services/WbotServices/StartAllWhatsAppsSessions";
import { clearAllDebounces } from "./helpers/Debounce";

const server = app.listen(process.env.PORT, () => {
  logger.info(`Server started on port: ${process.env.PORT}`);
});

initIO(server);
initRedis();
StartAllWhatsAppsSessions();

process.on("uncaughtException", err => {
  logger.error({ info: "Global uncaught exception", err });
});

process.on("unhandledRejection", err => {
  if (err) logger.error({ info: "Global unhandled rejection", err });
});

gracefulShutdown(server, {
  onShutdown: async () => {
    logger.info("Shutting down gracefully...");

    clearAllDebounces();

    const io = getIO();
    io.close();

    const redis = getRedisClient();
    if (redis) {
      redis.disconnect();
    }

    logger.info("Graceful shutdown complete");
  },
  timeout: 30000
});
