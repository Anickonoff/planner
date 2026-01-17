import fs from "fs";
import path from "path";

const LOG_LEVELS = ["info", "warn", "error"];

const logDir = process.env.LOG_DIR || "./logs";
const logFile = path.join(logDir, "planner.log");

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

function write(level, message, meta) {
  if (!LOG_LEVELS.includes(level)) {
    level = "info";
  }

  const ts = new Date().toISOString();
  const record = {
    ts,
    level,
    message,
    ...(meta ? { meta } : {}),
  };

  fs.appendFileSync(logFile, JSON.stringify(record) + "\n");

  // В dev удобно видеть ошибки в консоли
  if (level === "error") {
    console.error(record);
  }
}

export const logger = {
  info(message, meta) {
    write("info", message, meta);
  },
  warn(message, meta) {
    write("warn", message, meta);
  },
  error(message, meta) {
    write("error", message, meta);
  },
};
