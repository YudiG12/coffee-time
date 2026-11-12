# AGENTS.md

Coffee Time: a Portuguese-language site where subscribers send the owner a short audio or video message for his vlogs, plus an owner panel and an MCP endpoint for his AI editor. Everything in the repo is in English; everything the user sees is in Portuguese.

Read first: [ARCHITECTURE.md](ARCHITECTURE.md), [docs/PRD.md](docs/PRD.md), [docs/flows.md](docs/flows.md), [docs/design/](docs/design/).

## Stay inside ARCHITECTURE.md
Stay inside ARCHITECTURE.md. A feature that needs a service or pattern not listed there: stop, open an issue labeled `needs-owner` explaining why, and don't build it.

## Follow the design
Follow docs/design/ and the brand tokens. A new screen that changes the app's look (new layout, new navigation): stop, open an issue labeled `needs-owner` asking for a mockup. Small features that reuse existing patterns go straight to code.

Copy: short, correct Portuguese; icons, never emojis.

## Diagrams
Architecture and flow maps are generated: edit `docs/architecture/draw.py` / `draw_flows.py`, run `python3 docs/architecture/draw_flows.py`, render the PNGs, and look at them before committing.
