import { createEvent } from "../models/event.model.js";
import { config } from "../config/index.js";
import { toZonedTime } from "date-fns-tz";
import {
  addDays,
  addWeeks,
  isSameDay,
  isSameMonth,
  isSameWeek,
  startOfDay,
  startOfWeek,
} from "date-fns";

export class EventsService {
  constructor(repository) {
    this.repository = repository;
  }

  async createEvent(input) {
    const eventDateUtc = new Date(input.eventDate);

    // текущее время в TZ сервиса
    const nowZoned = toZonedTime(new Date(), config.timeZone);
    const eventZoned = toZonedTime(eventDateUtc, config.timeZone);

    if (eventZoned < nowZoned) {
      throw new Error("Нельзя создать событие в прошлом");
    }

    const event = createEvent(input);

    await this.repository.save((store) => {
      store.events.push(event);
    });

    return event;
  }

  async getStatus() {
    const data = await this.repository.load();
    const events = data.events || [];

    if (events.length === 0) {
      return { count: 0, nextEvent: null };
    }

    const nowZoned = toZonedTime(new Date(), config.timeZone);

    const upcoming = events
      .map((event) => ({
        event,
        zonedDate: toZonedTime(new Date(event.eventDate), config.timeZone),
      }))
      .filter(({ zonedDate }) => zonedDate >= nowZoned)
      .sort((a, b) => a.zonedDate - b.zonedDate);

    if (upcoming.length === 0) {
      return { count: events.length, nextEvent: null };
    }

    return {
      count: events.length,
      nextEvent: upcoming[0].event,
    };
  }

  async getEventById(eventId) {
    const data = await this.repository.load();
    return data.events.find((e) => e.id === eventId) || null;
  }

  async deleteEventById(eventId) {
    let deletedEvent = null;

    await this.repository.save((store) => {
      const index = store.events.findIndex((e) => e.id === eventId);
      if (index === -1) {
        return;
      }
      deletedEvent = store.events[index];
      store.events.splice(index, 1);
    });

    return deletedEvent;
  }
  async getEventsForNextWeek() {
    const data = await this.repository.load();
    const events = data.events || [];

    const nowZoned = toZonedTime(new Date(), config.timeZone);

    const startOfNextWeek = startOfWeek(
      addWeeks(nowZoned, 1),
      { weekStartsOn: 1 }, // понедельник
    );
    const endOfNextWeek = addWeeks(startOfNextWeek, 1);

    return events
      .map((event) => ({
        event,
        zonedDate: toZonedTime(new Date(event.eventDate), config.timeZone),
      }))
      .filter(
        ({ zonedDate }) =>
          zonedDate >= startOfNextWeek && zonedDate < endOfNextWeek,
      )
      .sort((a, b) => a.zonedDate - b.zonedDate)
      .map(({ event }) => event);
  }

  async getEventsForThisWeek() {
    const data = await this.repository.load();
    const events = data.events || [];

    const nowZoned = toZonedTime(new Date(), config.timeZone);
    const startOfThisWeek = startOfWeek(
      nowZoned,
      { weekStartsOn: 1 }, // понедельник
    );

    return events
      .map((event) => ({
        event,
        zonedDate: toZonedTime(new Date(event.eventDate), config.timeZone),
      }))
      .filter(({ zonedDate }) => isSameWeek(zonedDate, startOfThisWeek))
      .sort((a, b) => a.zonedDate - b.zonedDate)
      .map(({ event }) => event);
  }

  async getEventsForThisMonth() {
    const data = await this.repository.load();
    const events = data.events || [];

    const nowZoned = toZonedTime(new Date(), config.timeZone);

    return events
      .map((event) => ({
        event,
        zonedDate: toZonedTime(new Date(event.eventDate), config.timeZone),
      }))
      .filter(({ zonedDate }) => isSameMonth(zonedDate, nowZoned))
      .sort((a, b) => a.zonedDate - b.zonedDate)
      .map(({ event }) => event);
  }

  async getEventsForToday() {
    const data = await this.repository.load();
    const events = data.events || [];

    const todayZoned = toZonedTime(new Date(), config.timeZone);

    return events
      .map((event) => ({
        event,
        zonedDate: toZonedTime(new Date(event.eventDate), config.timeZone),
      }))
      .filter(({ zonedDate }) => isSameDay(zonedDate, todayZoned))
      .sort((a, b) => a.zonedDate - b.zonedDate)
      .map(({ event }) => event);
  }

  async getEventsForTomorrow() {
    const data = await this.repository.load();
    const events = data.events || [];

    const todayZoned = toZonedTime(new Date(), config.timeZone);
    const tomorrowZoned = addDays(todayZoned, 1);

    return events
      .map((event) => ({
        event,
        zonedDate: toZonedTime(new Date(event.eventDate), config.timeZone),
      }))
      .filter(({ zonedDate }) => isSameDay(zonedDate, tomorrowZoned))
      .sort((a, b) => a.zonedDate - b.zonedDate)
      .map(({ event }) => event);
  }

  async getAll() {
    const data = await this.repository.load();
    return data.events;
  }

  async autoCompleteDueEvents(now = new Date()) {
    const nowZoned = toZonedTime(now, config.timeZone);
    let updatedCount = 0;

    await this.repository.save((store) => {
      for (const event of store.events || []) {
        if (event.status !== "planned") {
          continue;
        }

        const eventZoned = toZonedTime(new Date(event.eventDate), config.timeZone);

        const isDue = event.hasTime
          ? eventZoned <= nowZoned
          : startOfDay(addDays(eventZoned, 1)) <= nowZoned;

        if (!isDue) {
          continue;
        }

        event.status = "completed";
        updatedCount += 1;
      }
    });

    return updatedCount;
  }

  async updateEvent(id, patch) {
    let updated = null;

    await this.repository.save((store) => {
      const event = store.events.find((e) => e.id === id);
      if (!event) return;

      // --- обработка даты ---
      if (patch.eventDate) {
        // frontend уже присылает UTC ISO-строку, поэтому повторно не переводим
        const utcDate = new Date(patch.eventDate);

        // валидация: нельзя в прошлом
        const nowZoned = toZonedTime(new Date(), config.timeZone);
        const eventZoned = toZonedTime(utcDate, config.timeZone);

        if (eventZoned < nowZoned) {
          throw new Error("Нельзя установить дату события в прошлом");
        }

        event.eventDate = utcDate.toISOString();
      }

      // --- обновление остальных полей ---
      if (patch.title !== undefined) {
        event.title = patch.title;
      }

      if (patch.description !== undefined) {
        event.description = patch.description;
      }

      if (patch.hasTime !== undefined) {
        event.hasTime = patch.hasTime;
      }

      // if (patch.completed !== undefined) {
      //   event.completed = patch.completed;
      // }

      if (patch.status !== undefined) {
        event.status = patch.status;
      }

      updated = event;
    });

    return updated;
  }
}
