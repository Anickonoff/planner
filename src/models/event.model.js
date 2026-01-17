import { randomUUID } from "crypto";

export function createEvent({ eventDate, title, description, chatId }) {
  return {
    id: randomUUID(),
    eventDate,
    title,
    description: description || "",
    chatId,
    createdAt: new Date().toISOString(),
    status: "planned",
  };
}
