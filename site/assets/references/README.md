# dots artwork

The sample characters use four unmodified official OpenAI portraits, retrieved as PNG from the Contentful originals linked by the official ChatGPT Learn dots documentation. Exact URLs and retrieval date are recorded in `dots-sources.json`.

`openai-felipe-poster.webp` is the official Felipe reference used with built-in ImageGen. The generated samples `/dots/felipe-16-poses-v2.png`, `/dots/iggy-16-poses-v1.png`, `/dots/todd-16-poses-v1.png`, and `/dots/alfred-16-poses-v1.png` preserve each identity while changing the body silhouette. The built-in ImageGen prompts are in `assets/felipe-16-poses-v2.prompt.txt` and `assets/other-dots-poses.prompts.json`. It is an AI-generated game sample, not an official OpenAI pose collection.

Palette: warm white `#FAF9F6`, near-black `#181818`, sky `#2EC8EB`, platform green `#169B39`, Todd-inspired lime `#C5EC37`, sun yellow `#FFE36F`, and a pale Iggy-inspired pink/lilac sheet background `#F0E8F1`.

The sheet is sliced into exactly 4×4 cells in the browser. Each of the 64 silhouettes is traced independently from PNG alpha, simplified with simplify-js and decomposed with Earcut into convex fixtures. The server derives and saves these fixtures on registration; the game uses each active player's own character and pose set.

`gameplay-tower.png` was captured from the shared game renderer after ten successful physics turns, with the 30–150% fixed pose sizes. It is the real shared game renderer, not AI-generated hero artwork. `scripts/generate-demo-game.ts` produces the reproducible demo state using the actual turn engine and Matter.js. Only a local QA fixture was inserted; no demo players or data were added to production.
