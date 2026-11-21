# makefun-csv-reader-speed

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/kimbaex07/makefun-csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/kimbaex07/makefun-csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast drop-in replacement for csv-reader 1.0.0: it reads broken CSV files and returns byte-identical answers (`{columns, rows, errors}`) at roughly 3–4x the reference speed. Plain records are sliced out whole and split on commas; only records holding a quote or a stray CR take the exact slow path, which jumps between delimiters with `indexOf` and copies whole slices. Pure dependency-free JavaScript, no third-party code.

## Run it

```sh
mkdir -p demo-out && MAKEFUN_INPUT_DIR=demo MAKEFUN_OUTPUT_DIR=demo-out node main.ts
```

`main.ts` reads every case from `$MAKEFUN_INPUT_DIR/cases.json` (default `/input`), answers each with `run` from `solve.js`, and writes `$MAKEFUN_OUTPUT_DIR/answers.json` (default `/output`). The `demo/` folder holds two small cases so the command above runs as-is. It needs Node 22.18 or later (`--no-incremental-marking` matches how the harness times it).

---

<sub>Entered on [make.fun](https://make.fun/?ref=4ey5v3b5&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
