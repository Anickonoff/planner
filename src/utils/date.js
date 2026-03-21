import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { ru } from "date-fns/locale";


export function formatEventDateForUser(event, timeZone) {
  const zoned = toZonedTime(new Date(event.eventDate), timeZone);
  const hasExplicitTime =
    event.hasTime === undefined
      ? !(zoned.getHours() === 0 && zoned.getMinutes() === 0)
      : event.hasTime;

  return format(zoned, hasExplicitTime ? "d MMMM, EEE, H:mm" : "d MMMM, EEE", {
    locale: ru,
  });
}
