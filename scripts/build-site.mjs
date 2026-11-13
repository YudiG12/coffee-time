#!/usr/bin/env node
// Bundles the browser-side media work (src/site/media.ts, ADR 0003) to public/media.js, served as a static asset.
// Runs before `npm run dev`, `npm run deploy` and `npm run verify`. The output is generated, not committed.
import { build } from "esbuild";
await build({ entryPoints: ["src/site/media.ts"], outfile: "public/media.js", bundle: true, format: "esm", minify: true, target: "es2022", legalComments: "none", logLevel: "warning" });
