import fetch from "node-fetch";

const BASE_URL = "https://api.telegram.org";

export async function telegramRequest(token, method, payload = {}) {
  const url = `${BASE_URL}/bot${token}/${method}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Telegram API HTTP error: ${res.status}`);
  }

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram API error: ${data.description}`);
  }

  return data.result;
}
