import { randomUUID } from "crypto";

export function createEvent({
  eventDate,
  title,
  description,
  chatId,
  hasTime = false,
}) {
  return {
    id: randomUUID(),
    eventDate,
    title,
    description: description || "",
    chatId,
    hasTime,
    // completed: false,
    createdAt: new Date().toISOString(),
    status: "planned",
  };
}
