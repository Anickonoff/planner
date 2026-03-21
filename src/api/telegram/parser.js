import { fromZonedTime } from "date-fns-tz";
import { config } from "../../config/index.js";

export function parseTelegramMessage(text) {
  if (!text) {
    return { error: "Пустое сообщение" };
  }

  // Формат: ДД.ММ [ЧЧ:ММ] Название [Описание]
  const parts = text.trim().split(/\s+/);
  const dateMatch = parts[0]?.match(/^(\d{1,2})\.(\d{1,2})$/);

  if (!dateMatch) {
    return { error: "Неверный формат даты. Используй Д[Д].М[М]" };
  }

  const day = Number(dateMatch[1]);
  const month = Number(dateMatch[2]) - 1;

  let cursor = 1;
  let hours = 0;
  let minutes = 0;
  let hasTime = false;

  const timeMatch = parts[cursor]?.match(/^(\d{1,2}):(\d{2})$/);
  if (timeMatch) {
    hours = Number(timeMatch[1]);
    minutes = Number(timeMatch[2]);
    hasTime = true;

    if (hours > 23 || minutes > 59) {
      return { error: "Неверное время" };
    }

    cursor++;
  }

  const title = parts[cursor];
  if (!title) {
    return { error: "Не указано название события" };
  }

  const description = parts.slice(cursor + 1).join(" ");
  const now = new Date();
  const localDate = new Date(now.getFullYear(), month, day, hours, minutes);
  // ❗ интерпретируем как локальное время приложения
  const utcDate = fromZonedTime(localDate, config.timeZone);

  return {
    eventDate: utcDate.toISOString(),
    title,
    description,
    hasTime,
  };
}
