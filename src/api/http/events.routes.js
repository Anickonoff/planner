import express from "express";

export function createEventsRouter(eventsService) {
  const router = express.Router();

  router.get("/", async (req, res) => {
    const events = await eventsService.getAll();
    res.json({ events });
  });

  router.get("/:id", async (req, res) => {
    const event = await eventsService.getEventById(req.params.id);
    if (!event) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json({ event });
  });

  router.post("/", async (req, res) => {
    try {
      const event = await eventsService.createEvent(req.body);
      res.status(201).json({ event });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put("/:id", async (req, res) => {
    try {
      const event = await eventsService.updateEvent(req.params.id, req.body);
      if (!event) {
        return res.status(404).json({ error: "Not found" });
      }
      res.json({ event });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete("/:id", async (req, res) => {
    const deleted = await eventsService.deleteEventById(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json({ ok: true });
  });

  return router;
}
