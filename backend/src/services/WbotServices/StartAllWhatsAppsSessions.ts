import ListWhatsAppsService from "../WhatsappService/ListWhatsAppsService";
import { StartWhatsAppSession } from "./StartWhatsAppSession";
import { logger } from "../../utils/logger";

const CONCURRENCY_LIMIT = 3;

async function asyncPool<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency: number
): Promise<void> {
  let index = 0;
  const running: Promise<void>[] = [];

  const enqueue = (): Promise<void> => {
    if (index >= items.length) return Promise.resolve();
    const current = index++;
    const p = fn(items[current]).catch(err =>
      logger.error({ info: "Error starting session", err })
    );
    running.push(p);

    const done = p.then(() => {
      running.splice(running.indexOf(done), 1);
    });

    if (running.length >= concurrency) {
      return Promise.race(running).then(() => enqueue());
    }
    return enqueue();
  };

  await enqueue();
  await Promise.all(running);
}

export const StartAllWhatsAppsSessions = async (): Promise<void> => {
  const whatsapps = await ListWhatsAppsService();
  if (whatsapps.length === 0) return;

  logger.info(
    `Starting ${whatsapps.length} WhatsApp sessions (concurrency: ${CONCURRENCY_LIMIT})`
  );

  await asyncPool(whatsapps, StartWhatsAppSession, CONCURRENCY_LIMIT);
};
