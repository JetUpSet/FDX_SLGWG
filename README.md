VizPref is a tool that can be used to visualize and explain bids and preferences that are typically found in Preferential Bidding Software solutions.

## About

Well lets be honest, PBS can be complicated sometimes, and even more complicated when you are trying to explain features and intent. The idea of this tool is to simulate the PBS environment to explain how dynamic changes can systemically change a solution. 

## Prerequisites

The app itself is static and dependency-free — just `index.html`, `styles.css`, and the
modules in `js/`.

**Running it:** because it now uses native ES modules, it must be served over HTTP
(opening `index.html` directly via `file://` will not load the modules). Any static
server works:

- VS Code "Live Server" (right-click `index.html` → "Open with Live Server"), or
- `python3 -m http.server 8137`, then open `http://localhost:8137/`.

**Tests (dev only):** install once with `npm install && npx playwright install chromium`,
then run `npm test`. The app ships with no runtime dependencies; the test harness is dev-only.

## Features

I am working on this part.


## Credits

This project started after I was tired of watching Microsoft Paint being used in Teams meetings. 

I would like to thank AZ and TM for being some of the greatest teammates I have worked alongside with on the larger project we are destined to complete.

Also shoutout to the dev team at the other company we are working alongside with, PK, HF, LA and the rest of you there.
