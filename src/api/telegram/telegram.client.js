import fetch from "node-fetch";
import { SocksProxyAgent } from "socks-proxy-agent";
import { config } from "../../config/index.js";

const BASE_URL = "https://api.telegram.org";
const telegramAgent = config.telegram.proxyUrl
  ? new SocksProxyAgent(config.telegram.proxyUrl)
  : undefined;

export async function telegramRequest(token, method, payload = {}) {
  const url = `${BASE_URL}/bot${token}/${method}`;

  const requestOptions = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };

  if (telegramAgent) {
    requestOptions.agent = telegramAgent;
  }

  const res = await fetch(url, requestOptions);

  if (!res.ok) {
    throw new Error(`Telegram API HTTP error: ${res.status}`);
  }

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram API error: ${data.description}`);
  }

  return data.result;
}
