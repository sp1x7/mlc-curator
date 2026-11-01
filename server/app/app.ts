import { Hono } from "hono";
import { catalogRoute } from "../api/catalog";
import { dbRoute } from "../api/db";
import { downloadsRoute } from "../api/downloads";
import { libraryRoute } from "../api/library";
import { settingsRoute } from "../api/settings";
import { tmdbRoute } from "../api/tmdb";
import { wishlistRoute } from "../api/wishlist";
import { eventsRoute } from "./events";

/** The api app: one mount per area route, plus a health probe. */
export const api = new Hono();

api.get("/health", (c) => c.json({ ok: true }));
api.route("/events", eventsRoute);
api.route("/library", libraryRoute);
api.route("/catalog", catalogRoute);
api.route("/downloads", downloadsRoute);
api.route("/db", dbRoute);
api.route("/settings", settingsRoute);
api.route("/tmdb", tmdbRoute);
api.route("/wishlist", wishlistRoute);
