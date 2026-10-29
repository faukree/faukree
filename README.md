# Faukree Dota 2 Tracker

Static dashboard for Steam account `924159299`, published with GitHub Pages. Data refreshed by GitHub Actions on a 10-minute schedule using OpenDota.

## What is included
- Last 20 matches with hero, W/L, K/D/A, damage, XP, gold, duration, date, ±25 estimate
- Estimated MMR from starting value 5068
- MMR / results chart
- Top 15 heroes by lifetime games, win rate and KDA estimate (KDA is calculated from available recent parsed matches)
- Responsive dark dashboard

## Publish on GitHub
1. Create a GitHub repository named **Faukree** (or use your existing repository).
2. Upload the project files and folders from this archive to the repository root.
3. In **Settings → Pages**, set **Build and deployment → Deploy from a branch**, select `main` and `/ (root)`, then Save.
4. In **Settings → Actions → General → Workflow permissions**, enable read/write access for workflows (the workflow also declares `contents: write`).
5. Open **Actions → Refresh Dota stats → Run workflow** once to populate data. Scheduled runs are every 10 minutes (`*/10 * * * *`), though GitHub may delay scheduled workflows.
6. Site URL will be `https://YOUR-USERNAME.github.io/Faukree/`.

## Data notes
- OpenDota is the data provider and may take time to parse match detail. Missing values render as em dashes.
- Dotabuff is not used as a direct API because it does not offer a stable public API for this use case. The OpenDota match URLs are suitable as a data-source alternative; do not scrape Dotabuff without checking its terms.
- Estimated MMR starts at 5068 and adds +25 per win / subtracts 25 per loss within the currently displayed 20-match window. It is an estimate, not Valve's official MMR.
- OpenDota API usage is subject to its rate limits. A run processes match details sequentially and inserts a small delay.
- Public GitHub Pages means the data is public. Do not put private keys or account secrets in the repository.

## Customizing
Edit `INITIAL_MMR` in `app.js` and `INITIAL_MMR` in `scripts/update_data.py` only if you later change the calculation (the initial MMR value is currently rendered in the front-end).
