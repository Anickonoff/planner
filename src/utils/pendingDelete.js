import fs from "fs/promises";

const TTL_MS = 5 * 60 * 1000; // 5 минут

export async function createPendingDelete(dataFile, eventId, chatId) {
  const raw = await fs.readFile(dataFile, "utf-8");
  const json = JSON.parse(raw);

  if (!json.meta) json.meta = {};
  if (!json.meta.pendingDeletes) json.meta.pendingDeletes = {};

  json.meta.pendingDeletes[eventId] = {
    chatId,
    expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
  };

  await fs.writeFile(dataFile, JSON.stringify(json, null, 2));
}

export async function getPendingDelete(dataFile, eventId) {
  const raw = await fs.readFile(dataFile, "utf-8");
  const json = JSON.parse(raw);

  return json.meta?.pendingDeletes?.[eventId] || null;
}

export async function clearPendingDelete(dataFile, eventId) {
  const raw = await fs.readFile(dataFile, "utf-8");
  const json = JSON.parse(raw);

  if (json.meta?.pendingDeletes?.[eventId]) {
    delete json.meta.pendingDeletes[eventId];
    await fs.writeFile(dataFile, JSON.stringify(json, null, 2));
  }
}

export async function clearPendingDeletesForChat(dataFile, chatId) {
  const raw = await fs.readFile(dataFile, "utf-8");
  const json = JSON.parse(raw);

  if (!json.meta?.pendingDeletes) {
    return 0;
  }

  let removed = 0;

  for (const [eventId, pending] of Object.entries(json.meta.pendingDeletes)) {
    if (pending.chatId === chatId) {
      delete json.meta.pendingDeletes[eventId];
      removed++;
    }
  }

  if (removed > 0) {
    await fs.writeFile(dataFile, JSON.stringify(json, null, 2));
  }

  return removed;
}
