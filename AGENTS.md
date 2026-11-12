# AGENTS.md

Coffee Time: a Portuguese-language site where subscribers send the owner a short audio or video message for his vlogs, plus an owner panel and an MCP endpoint for his AI editor. Everything in the repo is in English; everything the user sees is in Portuguese.

Read first: [ARCHITECTURE.md](ARCHITECTURE.md), [docs/PRD.md](docs/PRD.md), [the flows](ARCHITECTURE.md#flows), [docs/design/](docs/design/).

## Stay inside ARCHITECTURE.md
Stay inside ARCHITECTURE.md. A feature that needs a service or pattern not listed there: stop, open an issue labeled `needs-owner` explaining why, and don't build it.

## Follow the design
Follow docs/design/ and the brand tokens. A new screen that changes the app's look (new layout, new navigation): stop, open an issue labeled `needs-owner` asking for a mockup. Small features that reuse existing patterns go straight to code.

Copy: short, correct Portuguese; icons, never emojis.

## Diagrams
Every map is generated, never drawn by hand: `docs/architecture/draw.py` (architecture map), `draw_flows.py` (one map per flow, numbered arrows) and `docs/assets/build.py` (README banner and high-level design). After changing one, run `docs/architecture/render.sh`, open every PNG, and fix anything that overlaps or crosses before committing. A new service or flow updates the map, the flow maps and `ARCHITECTURE.md` in the same PR.
