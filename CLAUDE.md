# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository overview

This repo holds two unrelated, independent projects side by side:

- **Root (`index.html` + `assets/`)** — "Bütçe", a serverless static web app for daily
  income/expense tracking. Vanilla JS, no build step, no dependencies. All data lives in
  the browser's `localStorage`; nothing is ever sent to a server.
- **`tefas-fon-takip/`** — an independent Python CLI/report tool suite for tracking TEFAS
  (Turkish mutual fund platform) fund prices against a personal portfolio and target
  allocation. Has its own venv and its own README.

There is no shared build system, package manager, or dependency between the two — treat
them as separate codebases that happen to share a repo.

## Bütçe (root web app)

### Running

No build step or dependencies.

```bash
open index.html                    # simplest: open directly in a browser
python3 -m http.server 8000        # or serve locally
node tools/build-artifact.mjs      # -> dist/artifact.html, single-file bundle (inlines all CSS/JS)
```

Deployed via GitHub Pages: Settings → Pages → Deploy from a branch → this branch, `/ (root)`.

### Architecture

Script load order in `index.html` **is** the dependency order — each file builds on the
previous one, no module bundler:

| File | Responsibility |
|---|---|
| `assets/js/util.js` | Date helpers, `tr-TR` formatting, amount parsing |
| `assets/js/store.js` | Schema, `localStorage` persistence, CRUD, backup/restore, sample data |
| `assets/js/recurring.js` | Recurrence-date generation and idempotent processing |
| `assets/js/analytics.js` | Pure computation: summaries, breakdowns, series, budget, pivot |
| `assets/js/charts.js` | SVG donut/bar/line rendering, hover + tooltip layer |
| `assets/js/ui.js` | View state, rendering, forms |
| `assets/js/app.js` | Init, event binding, theme, import/export |

Key design decisions (see root `README.md` for the full rationale):

- **Amounts are always stored positive**; direction comes from a separate `type` field —
  eliminates sign-flip bugs at the source.
- **Recurring transactions are keyed by `occurrenceKey` (rule + date)**, so re-processing
  on every page load never double-creates an occurrence.
- **Categories carry a palette *slot*, not a color.** The slot maps to a `--series-N` CSS
  var defined separately per light/dark theme, so a category's color is stable regardless
  of sort order. Colors come from a colorblind-safe, contrast-checked palette; charts cap
  at 8 slices and fold the rest into "Diğer".
- **One axis per chart, always.** Daily spend and cumulative balance share a unit but
  differ wildly in magnitude, so they're separate charts rather than a dual-axis chart.

`tools/build-artifact.mjs` inlines every `<link rel="stylesheet">` and `<script src="...">`
in `index.html` into a single file — needed because the Artifact-published version runs
under a strict CSP that blocks external requests. Run it whenever you need a
CSP-safe single-file build; there's no watch mode.

## tefas-fon-takip (Python CLI suite)

### Setup & running

```bash
cd tefas-fon-takip
pip install -r requirements.txt   # tefas-crawler, pandas, requests, openpyxl, xlrd
```

All scripts read shared config from `ayarlar.py` (fund list, portfolio share counts,
cash, target allocation, drift threshold, optional cost basis) — **edit that file**, not
the scripts, to point this at a real portfolio.

```bash
python fon_takip.py                     # V1: latest price + daily return + category rank per fund
python kap_rapor.py --fon PHE --dosya x.xlsx   # V2: top-10 equity holdings from a KAP monthly report
python drift_rapor.py --demo            # V3: target vs. actual allocation, network-free demo
python drift_rapor.py --kaydet          # V3: real data, writes drift_rapor_YYYY-MM.md
python rapor_html.py --ac               # V4: interactive rapor.html, opens in browser
python rapor_html.py --onbellek         # V4: build from last successful fetch, no network call
python performans_rapor.py --kaydet     # V5: category screen + Sharpe/max-DD/correlation
python bist_tarama.py --kaydet          # V6: BIST P/E, net cash, FX-revenue screen
```

On Windows, double-click `rapor.bat` to run V4 end-to-end without a terminal.

### Architecture

Each script is a numbered, independently runnable layer; later ones import functions from
earlier ones rather than duplicating logic:

- **`fon_takip.py` (V1)** — thin wrapper around the `tefas` crawler package. `ham_veri_cek()`
  fetches raw daily rows per fund over a lookback window; `son_veri()` reduces to latest row
  per fund; `gunluk_getiri()` diffs the last two rows for daily % change. Note: the upstream
  tefas.gov.tr API **no longer publishes asset-class breakdown** (legacy endpoints were
  retired) — only price, date, and category rank/total are available now.
- **`kap_rapor.py` (V2)** — parses KAP (Public Disclosure Platform) monthly portfolio Excel
  reports to extract top equity holdings. The auto-download path (`kap_indir`) hits KAP's
  internal search API and is explicitly marked experimental/fragile; `--dosya` (manually
  downloaded file) is the reliable path and always works.
- **`drift_rapor.py` (V3)** — compares `ayarlar.HEDEFLER` (target % per group, e.g. 40%
  basket / 20% one fund / 40% cash) against actual holdings value (via `fon_takip`'s price
  fetch), flags groups where `|actual - target|` exceeds `DRIFT_ESIK`, and computes the
  buy/sell amount needed to return to target. `"NAKIT"` is a reserved fund code representing
  cash (`ayarlar.NAKIT_TL`).
- **`rapor_html.py` (V4)** — builds a single self-contained `rapor.html` by embedding a JSON
  data blob plus a hand-written JS app in an HTML template string; all rendering (donut,
  drift bars, sortable table, sparklines, history line chart, tooltips) happens client-side
  in that JS, not server-rendered. Reuses `degerleri_hesapla`/`drift_hesapla` from
  `drift_rapor.py` and `ham_veri_cek`/`gunluk_getiri`/`son_veri` from `fon_takip.py`. Also
  maintains two on-disk caches: `veri_onbellek.json` (last successful fetch, used when TEFAS
  is unreachable or `--onbellek` is passed) and `portfoy_gecmis.csv` (one row per day the
  report was generated, feeding the in-page history chart). In the browser itself, share
  counts and cash are editable inputs that recompute everything client-side and persist to
  `localStorage` (independent of the Python-rendered initial values) — the "Kalıcı Kaydet"
  card lets the user copy the edited values back into `ayarlar.py` Python-dict syntax.
- **`performans_rapor.py` (V5)** — screens the *entire* non-qualified-investor TEFAS fund
  universe (excludes `"Serbest Şemsiye Fonu"`, TEFAS's qualified-investor-only category) with
  AUM ≥ `ayarlar.MIN_FON_BUYUKLUK_TL`, bucketed into 8 categories via a rule-based classifier
  (`kategori_belirle`) that reads TEFAS's `fonTurAciklama` plus asset-breakdown percentages
  (e.g. foreign-stock % splits "Hisse Senedi Şemsiye Fonu" into BIST-heavy vs. foreign-equity;
  title keywords catch thematic/sector and participation funds). Fetches the whole universe's
  AUM/category/breakdown/returns in **3 bulk HTTP calls** (not the `tefas-crawler` package —
  it doesn't expose these fields; this script POSTs directly to
  `fonGnlBlgSiraliGetir`/`dagilimSiraliGetirT`/`fonGetiriBazliBilgiGetir`, the same endpoints
  the community `pytefas` client uses). Only the top-`KATEGORI_TOP_N`-per-category finalists
  get a per-fund daily-price-history fetch (via `tefas.Crawler`, rate-limited with a 1s sleep
  between calls) to compute Sharpe ratio, max drawdown, and a cross-fund correlation matrix.
  Category classification and the stopaj-rate table (`ayarlar.STOPAJ_ORANLARI`) are heuristics
  — review before trusting blindly.
- **`bist_tarama.py` (V6)** — independent of the TEFAS scripts; screens
  `ayarlar.HISSE_LISTESI` (a curated BIST watchlist, not the whole market) for P/E, net cash,
  and FX-revenue share, hitting İş Yatırım's undocumented public JSON endpoints directly with
  a 30s timeout (bypasses the `isyatirimhisse` package, which is *not* a dependency here — its
  own hardcoded 10s timeout was observed to fail against these endpoints). P/E is computed as
  market cap ÷ last-full-fiscal-year net income (`3Z` line item), **not** price ÷ the
  statement's own EPS field (`3ZD`) — that field's scale was found to be inconsistent between
  companies (TL vs. kuruş) during live testing, so it's ignored. Net cash = cash & equivalents
  (`1AA`) − short/long-term financial debt (`2AA`/`2BA`); FX-revenue % = domestic/export sales
  split (`4BC`/`4BD`). Banks/financials report under a different statement format
  (`financial_group`) and currently come back as "veri yok".

### Generated / personal-data files (gitignored, never commit)

`fon_dagilim.csv`, `drift_rapor_*.md`, `rapor.html`, `veri_onbellek.json`,
`portfoy_gecmis.csv` — all contain the user's actual portfolio numbers and are regenerated
by running the scripts. `performans_rapor_*.md`, `korelasyon_matrisi_*.csv`, and
`bist_tarama_*.md` (V5/V6 outputs) are also gitignored — not personal, but regenerable
market-data snapshots that would just bloat the repo. `ayarlar.py` itself (fund codes, share
counts, cash, targets) *is* committed, since it's the shared config the scripts read — be
aware it carries real portfolio data if this repo is ever made public.
