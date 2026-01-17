import fs from "fs/promises";
import path from "path";
import { config } from "../config/index.js";

export async function createBackup(sourceFile) {
  await fs.mkdir(config.backupDir || "./data/backups", { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(
    config.backupDir || "./data/backups",
    `events-${ts}.json`
  );

  await fs.copyFile(sourceFile, target);
}

export async function cleanupBackups(days = 7) {
  const dir = config.backupDir || "./data/backups";
  const files = await fs.readdir(dir).catch(() => []);
  const now = Date.now();

  for (const f of files) {
    const full = path.join(dir, f);
    const stat = await fs.stat(full);
    const ageDays = (now - stat.mtimeMs) / 86400000;
    if (ageDays > days) {
      await fs.unlink(full);
    }
  }
}
