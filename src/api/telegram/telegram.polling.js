const HELP_TEXT = `
📌 Как пользоваться планировщиком

Формат:
ДД.ММ [ЧЧ:ММ] Название [Описание]

Примеры:
12.01 Работа
12.01 8:30 Работа
15.01 18:30 Встреча с командой

⏰ Напоминание о событии придёт автоматически.
📅 Раз в неделю бот пришлёт список событий.

Команды:
/help — показать эту справку
/status — показать ближайшее событие
/today — события на сегодня
/tomorrow — события на завтра
/week — показать события на следующую неделю
/delete <id> — запросить удаление события
/confirm <id> — подтвердить удаление
/cancel — отменить удаление
`.trim();

import { telegramRequest } from "./telegram.client.js";
import { parseTelegramMessage } from "./parser.js";
import { metrics } from "../../utils/metrics.js";
import fs from "fs/promises";
import { EventsService } from "../../services/events.service.js";
import { EventsRepository } from "../../repositories/events.repository.js";
import { formatDateForUser } from "../../utils/date.js";
import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";
import {
  clearPendingDelete,
  clearPendingDeletesForChat,
  createPendingDelete,
  getPendingDelete,
} from "../../utils/pendingDelete.js";

export class TelegramPolling {
  constructor({ token, dataFile, interval, allowedChatId = null }) {
    this.token = token;
    this.dataFile = dataFile;
    this.interval = interval;
    this.allowedChatId = allowedChatId;
    this.offset = 0;
    this.running = false;
    this.timer = null;
    this.eventsService = new EventsService(new EventsRepository(this.dataFile));
  }

  async loadOffset() {
    const raw = await fs.readFile(this.dataFile, "utf-8");
    const json = JSON.parse(raw);
    this.offset = json.meta?.telegramOffset || 0;
    metrics.setTelegramOffset(this.offset);
  }

  async saveOffset() {
    const raw = await fs.readFile(this.dataFile, "utf-8");
    const json = JSON.parse(raw);
    json.meta.telegramOffset = this.offset;
    await fs.writeFile(this.dataFile, JSON.stringify(json, null, 2));
    metrics.setTelegramOffset(this.offset);
  }

  async pollOnce() {
    try {
      const updates = await telegramRequest(this.token, "getUpdates", {
        timeout: 30,
        offset: this.offset,
      });

      for (const update of updates) {
        this.offset = update.update_id + 1;
        metrics.incTelegramUpdates();

        const msg = update.message;
        if (!msg?.text) continue;

        const chatId = msg.chat.id;

        // если ограничение задано и чат не тот — игнорируем
        if (this.allowedChatId !== null && chatId !== this.allowedChatId) {
          continue;
        }

        const text = msg.text.trim();

        // команды
        if (text === "/help" || text === "/start") {
          await telegramRequest(this.token, "sendMessage", {
            chat_id: chatId,
            text: HELP_TEXT,
          });
          continue;
        }

        if (text === "/status") {
          const status = await this.eventsService.getStatus();

          if (status.count === 0) {
            await telegramRequest(this.token, "sendMessage", {
              chat_id: chatId,
              text: `📊 Статус планировщика\n\n` + `Событий пока нет`,
            });
            continue;
          }

          if (!status.nextEvent) {
            await telegramRequest(this.token, "sendMessage", {
              chat_id: chatId,
              text:
                `📊 Статус планировщика\n\n` +
                `Всего событий: ${status.count}\n\n` +
                `Будущих событий нет`,
            });
            continue;
          }

          const dateText = formatDateForUser(
            status.nextEvent.eventDate,
            config.timeZone
          );

          await telegramRequest(this.token, "sendMessage", {
            chat_id: chatId,
            text:
              `📊 Статус планировщика\n\n` +
              `Всего событий: ${status.count}\n\n` +
              `Ближайшее:\n` +
              `${status.nextEvent.title}\n` +
              `${dateText}`,
          });

          continue;
        }

        if (text.startsWith("/delete")) {
          const [, eventId] = text.split(/\s+/);

          if (!eventId) {
            await telegramRequest(this.token, "sendMessage", {
              chat_id: chatId,
              text: `⚠️ Ошибка\n\nИспользуй:\n/delete <id>`,
            });
            continue;
          }

          const event = await this.eventsService.getEventById(eventId);

          if (!event) {
            await telegramRequest(this.token, "sendMessage", {
              chat_id: chatId,
              text: `⚠️ Ошибка\n\nСобытие не найдено`,
            });
            continue;
          }

          await createPendingDelete(this.dataFile, eventId, chatId);

          const dateText = formatDateForUser(event.eventDate, config.timeZone);

          await telegramRequest(this.token, "sendMessage", {
            chat_id: chatId,
            text:
              `⚠️ Подтверждение удаления\n\n` +
              `Событие:\n` +
              `${event.title}\n` +
              `${dateText}\n\n` +
              `Подтвердите командой:\n` +
              `/confirm ${eventId}\n` +
              `(действительно 5 минут)`,
          });

          continue;
        }

        if (text.startsWith("/confirm")) {
          const [, eventId] = text.split(/\s+/);

          if (!eventId) {
            await telegramRequest(this.token, "sendMessage", {
              chat_id: chatId,
              text: `⚠️ Ошибка\n\nИспользуй:\n/confirm <id>`,
            });
            continue;
          }

          const pending = await getPendingDelete(this.dataFile, eventId);

          if (!pending) {
            await telegramRequest(this.token, "sendMessage", {
              chat_id: chatId,
              text: `⚠️ Ошибка\n\nНет ожидающего подтверждения`,
            });
            continue;
          }

          if (pending.chatId !== chatId) {
            await telegramRequest(this.token, "sendMessage", {
              chat_id: chatId,
              text: `⚠️ Ошибка\n\nНедостаточно прав`,
            });
            continue;
          }

          if (new Date(pending.expiresAt) < new Date()) {
            await clearPendingDelete(this.dataFile, eventId);
            await telegramRequest(this.token, "sendMessage", {
              chat_id: chatId,
              text: `⚠️ Ошибка\n\nВремя подтверждения истекло`,
            });
            continue;
          }

          const deleted = await this.eventsService.deleteEventById(eventId);
          await clearPendingDelete(this.dataFile, eventId);

          if (!deleted) {
            await telegramRequest(this.token, "sendMessage", {
              chat_id: chatId,
              text: `⚠️ Ошибка\n\nСобытие не найдено`,
            });
            continue;
          }

          const dateText = formatDateForUser(
            deleted.eventDate,
            config.timeZone
          );

          await telegramRequest(this.token, "sendMessage", {
            chat_id: chatId,
            text:
              `🗑 Событие удалено\n\n` + `${deleted.title}\n` + `${dateText}`,
          });

          continue;
        }

        if (text === "/cancel") {
          const removed = await clearPendingDeletesForChat(
            this.dataFile,
            chatId
          );

          if (removed === 0) {
            await telegramRequest(this.token, "sendMessage", {
              chat_id: chatId,
              text: `ℹ️ Отмена\n\n` + `Нет ожидающих операций для отмены`,
            });
            continue;
          }

          await telegramRequest(this.token, "sendMessage", {
            chat_id: chatId,
            text: `✅ Отмена\n\n` + `Операция удаления отменена`,
          });

          continue;
        }

        if (text === "/week") {
          const events = await this.eventsService.getEventsForNextWeek();

          if (events.length === 0) {
            await telegramRequest(this.token, "sendMessage", {
              chat_id: chatId,
              text: `📅 События на следующую неделю\n\n` + `Событий нет`,
            });
            continue;
          }

          const lines = events.map((event) => {
            const dateText = formatDateForUser(
              event.eventDate,
              config.timeZone
            );
            return `• ${dateText} — ${event.title}\n id: ${event.id}`;
          });

          await telegramRequest(this.token, "sendMessage", {
            chat_id: chatId,
            text: `📅 События на следующую неделю\n\n` + lines.join("\n"),
          });

          continue;
        }

        if (text === "/today") {
          const events = await this.eventsService.getEventsForToday();

          if (events.length === 0) {
            await telegramRequest(this.token, "sendMessage", {
              chat_id: chatId,
              text: `📅 События на сегодня\n\nСобытий нет`,
            });
            continue;
          }

          const lines = events.map((event) => {
            const dateText = formatDateForUser(
              event.eventDate,
              config.timeZone
            );
            return `• ${dateText} — ${event.title}\n id:${event.id}`;
          });

          await telegramRequest(this.token, "sendMessage", {
            chat_id: chatId,
            text: `📅 События на сегодня\n\n${lines.join("\n")}`,
          });

          continue;
        }

        if (text === "/tomorrow") {
          const events = await this.eventsService.getEventsForTomorrow();

          if (events.length === 0) {
            await telegramRequest(this.token, "sendMessage", {
              chat_id: chatId,
              text: `📅 События на завтра\n\nСобытий нет`,
            });
            continue;
          }

          const lines = events.map((event) => {
            const dateText = formatDateForUser(
              event.eventDate,
              config.timeZone
            );
            return `• ${dateText} — ${event.title}\n id:${event.id}`;
          });

          await telegramRequest(this.token, "sendMessage", {
            chat_id: chatId,
            text: `📅 События на завтра\n\n${lines.join("\n")}`,
          });

          continue;
        }

        //парсинг сообщения

        const parsed = parseTelegramMessage(msg.text);
        if (parsed.error) {
          await telegramRequest(this.token, "sendMessage", {
            chat_id: chatId,
            text: `Ошибка: ${parsed.error}`,
          });
          continue;
        }

        let event;
        try {
          event = await this.eventsService.createEvent({
            ...parsed,
            chatId,
          });
        } catch (err) {
          await telegramRequest(this.token, "sendMessage", {
            chat_id: chatId,
            text: `⚠️ Ошибка\n\n` + `${err.message}`,
          });
          continue;
        }

        const dateText = formatDateForUser(event.eventDate, config.timeZone);
        await telegramRequest(this.token, "sendMessage", {
          chat_id: chatId,
          text: `📌 Событие создано\n\n` + `${event.title}\n` + `${dateText}`,
        });
      }

      await this.saveOffset();
    } catch (err) {
      metrics.incTelegramErrors();
      logger.error("Telegram polling error", {
        error: err.message,
      });
    }
  }

  async start() {
    if (this.running) return;
    this.running = true;
    logger.info("Telegram polling started");

    await this.loadOffset();

    const loop = async () => {
      if (!this.running) return;
      await this.pollOnce();
      this.timer = setTimeout(loop, this.interval);
    };

    loop();
  }

  async stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    await this.saveOffset();
  }
}
