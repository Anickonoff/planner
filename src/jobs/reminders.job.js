import cron from "node-cron";
import fs from "fs/promises";
import { telegramRequest } from "../api/telegram/telegram.client.js";
import { formatEventDateForUser } from "../utils/date.js";
import { config } from "../config/index.js";
import { toZonedTime } from "date-fns-tz";
import { isSameDay, addDays, format, startOfWeek, addWeeks } from "date-fns";
import { wasReminderSent, markReminderSent } from "../utils/reminderDedup.js";

export class RemindersJob {
  constructor({ dataFile, telegramToken, eventsService }) {
    this.dataFile = dataFile;
    this.telegramToken = telegramToken;
    this.eventsService = eventsService;
    this.tasks = [];
  }

  async loadEvents() {
    const raw = await fs.readFile(this.dataFile, "utf-8");
    return JSON.parse(raw).events || [];
  }

  async send(chatId, text) {
    await telegramRequest(this.telegramToken, "sendMessage", {
      chat_id: chatId,
      text,
    });
  }

  start() {
    if (this.eventsService) {
      this.tasks.push(
        cron.schedule("*/5 * * * *", async () => {
          await this.eventsService.autoCompleteDueEvents();
        })
      );
    }

    // Каждый день в 09:00 — напоминания на завтра
    this.tasks.push(
      cron.schedule("0 9 * * *", async () => {
        await this.remindTomorrow();
      })
    );

    // Каждый понедельник в 09:00 — план на неделю
    this.tasks.push(
      cron.schedule("0 9 * * 1", async () => {
        // cron.schedule("* * * * *", async () => {
        await this.remindWeek();
      })
    );
  }

  stop() {
    for (const task of this.tasks) {
      task.stop();
    }
  }

  async remindTomorrow() {
    const events = await this.loadEvents();

    const nowZoned = toZonedTime(new Date(), config.timeZone);
    const tomorrowZoned = addDays(nowZoned, 1);
    const reminderDate = format(tomorrowZoned, "yyyy-MM-dd");

    for (const event of events) {
      const eventZoned = toZonedTime(
        new Date(event.eventDate),
        config.timeZone
      );

      if (!isSameDay(eventZoned, tomorrowZoned)) {
        continue;
      }

      const dedupKey = buildDedupKey("tomorrow", event.id, reminderDate);

      if (await wasReminderSent(this.dataFile, dedupKey)) {
        continue;
      }

      const dateText = formatEventDateForUser(event, config.timeZone);

      await this.send(
        event.chatId,
        `⏰ Напоминание\n\n` + `Завтра:\n` + `${event.title}\n` + `${dateText}`
      );
      await markReminderSent(this.dataFile, dedupKey);
    }
  }

  async remindWeek() {
    const events = await this.loadEvents();
    const nowZoned = toZonedTime(new Date(), config.timeZone);

    // Начало следующей недели (понедельник)
    const startOfNextWeek = startOfWeek(
      addWeeks(nowZoned, 1),
      { weekStartsOn: 1 } // понедельник
    );
    const reminderDate = format(startOfNextWeek, "yyyy-MM-dd");
    const endOfNextWeek = addWeeks(startOfNextWeek, 1);

    const weekEvents = [];

    for (const event of events) {
      const eventZoned = toZonedTime(
        new Date(event.eventDate),
        config.timeZone
      );

      if (eventZoned < startOfNextWeek || eventZoned >= endOfNextWeek) {
        continue;
      }

      const dedupKey = buildDedupKey("week", event.id, reminderDate);

      if (await wasReminderSent(this.dataFile, dedupKey)) {
        continue;
      }

      weekEvents.push({
        event,
        zonedDate: eventZoned,
        dedupKey,
      });
    }

    if (weekEvents.length === 0) return;
    weekEvents.sort((a, b) => a.zonedDate - b.zonedDate);

    const text =
      "📅 События на следующую неделю:\n\n" +
      weekEvents
        .map(({ event }) => {
          const dateText = formatEventDateForUser(event, config.timeZone);
          return `• ${dateText} — ${event.title}\n id: ${event.id}`;
        })
        .join("\n");

    // отправляем сообщение
    await this.send(weekEvents[0].event.chatId, text);
    // ПОСЛЕ успешной отправки — отмечаем все события
    for (const { dedupKey } of weekEvents) {
      await markReminderSent(this.dataFile, dedupKey);
    }
  }
}

function buildDedupKey(type, eventId, date) {
  return `${type}:${eventId}:${date}`;
}
