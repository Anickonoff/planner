import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { ru } from "date-fns/locale";

export function formatDateForUser(isoDate, timeZone) {
  const zoned = toZonedTime(new Date(isoDate), timeZone);

  return format(zoned, "d MMMM, EEE, H:mm", {
    locale: ru,
  });
}
