import fs from "fs/promises";
import { withFileLock } from "../utils/fileLock.js";
import { createBackup, cleanupBackups } from "../utils/backup.js";

export class EventsRepository {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async load() {
    const raw = await fs.readFile(this.filePath, "utf-8");
    return JSON.parse(raw);
  }

  async save(mutator) {
    return withFileLock(async () => {
      await createBackup(this.filePath);

      const data = await this.load();
      const result = await mutator(data);

      data.meta.updatedAt = new Date().toISOString();
      await fs.writeFile(this.filePath, JSON.stringify(data, null, 2));

      await cleanupBackups();
      return result;
    });
  }
}
