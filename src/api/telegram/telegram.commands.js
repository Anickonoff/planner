import { telegramRequest } from "./telegram.client.js";
import { formatEventDateForUser } from "../../utils/date.js";
import { config } from "../../config/index.js";
import {
  clearPendingDelete,
  clearPendingDeletesForChat,
  createPendingDelete,
  getPendingDelete,
} from "../../utils/pendingDelete.js";

const HELP_TEXT = `
📌 Как пользоваться планировщиком

Формат:
Д[Д].М[М] [ЧЧ:ММ] Название [Описание]

Примеры:
7.1 Работа
12.01 8:30 Работа
15.01 18:30 Встреча с командой

⏰ Напоминание о событии придёт автоматически.
📅 Раз в неделю бот пришлёт список событий.

Команды:
/help — показать эту справку
/status — показать ближайшее событие
/today — события на сегодня
/tomorrow — события на завтра
/week — показать события на эту неделю
/nextweek - показать события на следующую неделю
/month — показать события на этот месяц
/delete <id> — запросить удаление события
/confirm <id> — подтвердить удаление
/cancel — отменить удаление
`.trim();

export async function handleTelegramCommand({
  text,
  chatId,
  token,
  eventsService,
  dataFile,
}) {
  if (text === "/help" || text === "/start") {
    await telegramRequest(token, "sendMessage", {
      chat_id: chatId,
      text: HELP_TEXT,
    });
    return true;
  }

  if (text === "/status") {
    const status = await eventsService.getStatus();

    if (status.count === 0) {
      await telegramRequest(token, "sendMessage", {
        chat_id: chatId,
        text: `📊 Статус планировщика\n\n` + `Событий пока нет`,
      });
      return true;
    }

    if (!status.nextEvent) {
      await telegramRequest(token, "sendMessage", {
        chat_id: chatId,
        text:
          `📊 Статус планировщика\n\n` +
          `Всего событий: ${status.count}\n\n` +
          `Будущих событий нет`,
      });
      return true;
    }

    const dateText = formatEventDateForUser(status.nextEvent, config.timeZone);

    await telegramRequest(token, "sendMessage", {
      chat_id: chatId,
      text:
        `📊 Статус планировщика\n\n` +
        `Всего событий: ${status.count}\n\n` +
        `Ближайшее:\n` +
        `${status.nextEvent.title}\n` +
        `${dateText}`,
    });

    return true;
  }

  if (text.startsWith("/delete")) {
    const [, eventId] = text.split(/\s+/);

    if (!eventId) {
      await telegramRequest(token, "sendMessage", {
        chat_id: chatId,
        text: `⚠️ Ошибка\n\nИспользуй:\n/delete <id>`,
      });
      return true;
    }

    const event = await eventsService.getEventById(eventId);

    if (!event) {
      await telegramRequest(token, "sendMessage", {
        chat_id: chatId,
        text: `⚠️ Ошибка\n\nСобытие не найдено`,
      });
      return true;
    }

    await createPendingDelete(dataFile, eventId, chatId);

    const dateText = formatEventDateForUser(event, config.timeZone);

    await telegramRequest(token, "sendMessage", {
      chat_id: chatId,
      parse_mode: "Markdown",
      text:
        `⚠️ Подтверждение удаления\n\n` +
        `Событие:\n` +
        `${event.title}\n` +
        `${dateText}\n\n` +
        `Подтвердите командой:\n` +
        `/confirm \`${eventId}\`\n` +
        `(действительно 5 минут)`,
    });

    return true;
  }

  if (text.startsWith("/confirm")) {
    const [, eventId] = text.split(/\s+/);

    if (!eventId) {
      await telegramRequest(token, "sendMessage", {
        chat_id: chatId,
        text: `⚠️ Ошибка\n\nИспользуй:\n/confirm <id>`,
      });
      return true;
    }

    const pending = await getPendingDelete(dataFile, eventId);

    if (!pending) {
      await telegramRequest(token, "sendMessage", {
        chat_id: chatId,
        text: `⚠️ Ошибка\n\nНет ожидающего подтверждения`,
      });
      return true;
    }

    if (pending.chatId !== chatId) {
      await telegramRequest(token, "sendMessage", {
        chat_id: chatId,
        text: `⚠️ Ошибка\n\nНедостаточно прав`,
      });
      return true;
    }

    if (new Date(pending.expiresAt) < new Date()) {
      await clearPendingDelete(dataFile, eventId);
      await telegramRequest(token, "sendMessage", {
        chat_id: chatId,
        text: `⚠️ Ошибка\n\nВремя подтверждения истекло`,
      });
      return true;
    }

    const deleted = await eventsService.deleteEventById(eventId);
    await clearPendingDelete(dataFile, eventId);

    if (!deleted) {
      await telegramRequest(token, "sendMessage", {
        chat_id: chatId,
        text: `⚠️ Ошибка\n\nСобытие не найдено`,
      });
      return true;
    }

    const dateText = formatEventDateForUser(deleted, config.timeZone);

    await telegramRequest(token, "sendMessage", {
      chat_id: chatId,
      text: `🗑 Событие удалено\n\n` + `${deleted.title}\n` + `${dateText}`,
    });

    return true;
  }

  if (text === "/cancel") {
    const removed = await clearPendingDeletesForChat(dataFile, chatId);

    if (removed === 0) {
      await telegramRequest(token, "sendMessage", {
        chat_id: chatId,
        text: `ℹ️ Отмена\n\n` + `Нет ожидающих операций для отмены`,
      });
      return true;
    }

    await telegramRequest(token, "sendMessage", {
      chat_id: chatId,
      text: `✅ Отмена\n\n` + `Операция удаления отменена`,
    });

    return true;
  }

  if (text === "/week") {
    const events = await eventsService.getEventsForThisWeek();
    if (events.length === 0) {
      await telegramRequest(token, "sendMessage", {
        chat_id: chatId,
        text: `📅 События на этой неделе\n\nСобытий нет`,
      });
      return true;
    }
    const lines = events.map((event) => {
      const dateText = formatEventDateForUser(event, config.timeZone);
      return `• ${dateText} — ${event.title}\n id: \`${event.id}\``;
    });
    await telegramRequest(token, "sendMessage", {
      chat_id: chatId,
      parse_mode: "Markdown",
      text: `📅 События на этой неделе (прошедшие и будущие)\n\n${lines.join("\n")}`,
    });
    return true;
  }

  if (text === "/nextweek") {
    const events = await eventsService.getEventsForNextWeek();

    if (events.length === 0) {
      await telegramRequest(token, "sendMessage", {
        chat_id: chatId,
        text: `📅 События на следующую неделю\n\n` + `Событий нет`,
      });
      return true;
    }

    const lines = events.map((event) => {
      const dateText = formatEventDateForUser(event, config.timeZone);
      return `• ${dateText} — ${event.title}\n id: \`${event.id}\``;
    });

    await telegramRequest(token, "sendMessage", {
      chat_id: chatId,
      parse_mode: "Markdown",
      text: `📅 События на следующую неделю\n\n` + lines.join("\n"),
    });

    return true;
  }

  if (text === "/month") {
    const events = await eventsService.getEventsForThisMonth();

    if (events.length === 0) {
      await telegramRequest(token, "sendMessage", {
        chat_id: chatId,
        text: `📅 События в этом месяце\n\n` + `Событий нет`,
      });
      return true;
    }

    const lines = events.map((event) => {
      const dateText = formatEventDateForUser(event, config.timeZone);
      return `• ${dateText} — ${event.title}\n id: \`${event.id}\``;
    });

    await telegramRequest(token, "sendMessage", {
      chat_id: chatId,
      parse_mode: "Markdown",
      text:
        `📅 События в этом месяце (прошедшие и будущие)\n\n` + lines.join("\n"),
    });

    return true;
  }

  if (text === "/today") {
    const events = await eventsService.getEventsForToday();

    if (events.length === 0) {
      await telegramRequest(token, "sendMessage", {
        chat_id: chatId,
        text: `📅 События на сегодня\n\nСобытий нет`,
      });
      return true;
    }

    const lines = events.map((event) => {
      const dateText = formatEventDateForUser(event, config.timeZone);
      return `• ${dateText} — ${event.title}\n id: \`${event.id}\``;
    });

    await telegramRequest(token, "sendMessage", {
      chat_id: chatId,
      parse_mode: "Markdown",
      text: `📅 События на сегодня\n\n${lines.join("\n")}`,
    });

    return true;
  }

  if (text === "/tomorrow") {
    const events = await eventsService.getEventsForTomorrow();

    if (events.length === 0) {
      await telegramRequest(token, "sendMessage", {
        chat_id: chatId,
        text: `📅 События на завтра\n\nСобытий нет`,
      });
      return true;
    }

    const lines = events.map((event) => {
      const dateText = formatEventDateForUser(event, config.timeZone);
      return `• ${dateText} — ${event.title}\n id: \`${event.id}\``;
    });

    await telegramRequest(token, "sendMessage", {
      chat_id: chatId,
      parse_mode: "Markdown",
      text: `📅 События на завтра\n\n${lines.join("\n")}`,
    });

    return true;
  }

  return false;
}
