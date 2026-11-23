# token-radar-latency-feed

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/yusuf-marchetti/token-radar-latency-feed/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/yusuf-marchetti/token-radar-latency-feed/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Latency Feed — a minimal-latency token launch radar. It ranks protocols whose token does not exist yet by implied value, and gives each one a farm plan that starts with the alert, so the reader acts on the signal the hour it moves instead of at the next weekly check.

The implied value follows only from the snapshot's own figures: TVL × 0.30 × velocity × overdue × breadth. Velocity is the 7-day TVL change clamped to −50…+150%. Overdue grows with the days a protocol has run with no token (up to 900 days). Breadth adds 4% per chain, up to 5 chains. No protocol name is ever special-cased. The board covers all 40 watchlist protocols plus the 200 pre-token protocols below the floor with the most TVL — 240 rows. Live-token protocols are kept apart and shown at the market's own values.

The dashboard is a static page with no network: a sortable, filterable board, a detail view per protocol with the model breakdown and its farm plan, a live-token view, and a model sandbox that re-ranks the board live from the same formula.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Then open `out/dashboard/index.html` (it reads `out/data.js` beside it).

---

<sub>Entered on [make.fun](https://make.fun/?ref=yusuf-marchetti&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
