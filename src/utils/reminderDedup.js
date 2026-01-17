import fs from "fs/promises";

export async function wasReminderSent(dataFile, key) {
  const raw = await fs.readFile(dataFile, "utf-8");
  const json = JSON.parse(raw);

  return Boolean(json.meta?.sentReminders?.[key]);
}

export async function markReminderSent(dataFile, key) {
  const raw = await fs.readFile(dataFile, "utf-8");
  const json = JSON.parse(raw);

  if (!json.meta) json.meta = {};
  if (!json.meta.sentReminders) json.meta.sentReminders = {};

  json.meta.sentReminders[key] = true;

  await fs.writeFile(dataFile, JSON.stringify(json, null, 2));
}

export async function cleanupOldReminders(dataFile, keepDays = 30) {
  const raw = await fs.readFile(dataFile, "utf-8");
  const json = JSON.parse(raw);

  if (!json.meta?.sentReminders) return;

  const cutoff = Date.now() - keepDays * 86400000;

  for (const key of Object.keys(json.meta.sentReminders)) {
    const datePart = key.split(":")[2];
    if (new Date(datePart).getTime() < cutoff) {
      delete json.meta.sentReminders[key];
    }
  }

  await fs.writeFile(dataFile, JSON.stringify(json, null, 2));
}
