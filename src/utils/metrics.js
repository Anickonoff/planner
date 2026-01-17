let state = {
  service_ready: 0,
  service_shutting_down: 0,
  telegram_updates_total: 0,
  telegram_polling_errors_total: 0,
  telegram_offset: 0
};

export const metrics = {
  setReady(v){ state.service_ready = v; },
  setShuttingDown(v){ state.service_shutting_down = v; },
  incTelegramUpdates(){ state.telegram_updates_total++; },
  incTelegramErrors(){ state.telegram_polling_errors_total++; },
  setTelegramOffset(v){ state.telegram_offset = v; }
};

export function renderMetrics() {
  return [
    `process_uptime_seconds ${process.uptime()}`,
    `service_ready ${state.service_ready}`,
    `service_shutting_down ${state.service_shutting_down}`,
    `telegram_updates_total ${state.telegram_updates_total}`,
    `telegram_polling_errors_total ${state.telegram_polling_errors_total}`,
    `telegram_offset ${state.telegram_offset}`
  ].join('\n');
}
