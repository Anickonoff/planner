import "dotenv/config";
import express from "express";
import { config } from "./config/index.js";
import { renderMetrics, metrics } from "./utils/metrics.js";
import { TelegramPolling } from "./api/telegram/telegram.polling.js";
import { RemindersJob } from "./jobs/reminders.job.js";
import { logger } from "./utils/logger.js";
import { createEventsRouter } from "./api/http/events.routes.js";
import { EventsService } from "./services/events.service.js";
import { EventsRepository } from "./repositories/events.repository.js";

const app = express();
let ready = false;
let shuttingDown = false;
let polling;
let reminders;

const eventsRepository = new EventsRepository(config.dataFile);
const eventsService = new EventsService(eventsRepository);

function maskProxyUrl(value) {
  if (!value) return null;

  try {
    const url = new URL(value);

    if (url.username) {
      url.username = "***";
    }

    if (url.password) {
      url.password = "***";
    }

    return url.toString();
  } catch {
    return "[invalid proxy url]";
  }
}

app.get("/health", (_, res) => res.status(200).json({ status: "ok" }));

app.get("/ready", (_, res) => {
  if (ready && !shuttingDown) return res.status(200).json({ ready: true });
  res.status(503).json({ ready: false });
});

app.get("/metrics", (_, res) => {
  res.set("Content-Type", "text/plain; version=0.0.4");
  res.send(renderMetrics());
});

app.use(express.json());
app.use("/api/events", createEventsRouter(eventsService));

const server = app.listen(config.port, async () => {
  ready = true;
  metrics.setReady(1);
  logger.info("Service started");

  if (config.telegram.token) {
    logger.info("Telegram proxy configuration", {
      enabled: Boolean(config.telegram.proxyUrl),
      proxyUrl: maskProxyUrl(config.telegram.proxyUrl),
    });

    try {
      reminders = new RemindersJob({
        dataFile: config.dataFile,
        telegramToken: config.telegram.token,
        eventsService,
      });
      reminders.start();

      polling = new TelegramPolling({
        token: config.telegram.token,
        interval: config.telegram.pollingInterval,
        dataFile: config.dataFile,
        eventsService, // 👈 если polling использует сервис
      });

      await polling.start();
    } catch (error) {
      logger.error("Error starting Telegram polling:", {
        error});
      shutdown();
    }
  }
});

const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  ready = false;
  metrics.setReady(0);
  metrics.setShuttingDown(1);
  logger.info("Service shutting down");
  if (reminders) {
    try {
      await reminders.stop();
    } catch (error) {
      logger.error("Error stopping reminders job:", { error: error });
    }
  }
  if (polling) {
    try {
      await polling.stop();
    } catch (error) {
      logger.error("Error stopping Telegram polling:", { error: error });
    }
  }
  server.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
