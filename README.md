# Magic Mirror V-Day Scaffold

This project gives you a fast, low-risk MagicMirror setup that works on macOS first, then moves to Raspberry Pi.

## What is included

- Pinned MagicMirror runtime (`v2.34.0`) bootstrapped into `runtime/MagicMirror`
- Standard modules configured: clock, calendar, weather, compliments
- Custom modules:
  - `MMM-ValentineNote`
  - `MMM-OurShow`
  - `MMM-SubwayL`
- Sync scripts so your editable source stays in this repo (`mirror-config/` and `custom_modules/`)

## Can I preview this on my Mac first?

Yes. You can run the full mirror on macOS without using the Pi.

- Desktop app preview (Electron): `./scripts/run-mac.sh`
- Browser preview (server only): `./scripts/run-server.sh` then open [http://localhost:8080](http://localhost:8080)

## Quick start

1. Install Node.js LTS (recommended: 20.x or newer) and npm.
2. From this repo, run:

```bash
./scripts/bootstrap.sh
```

3. Start preview:

```bash
./scripts/run-mac.sh
```

or

```bash
./scripts/run-server.sh
```

## Files you will edit most

- Main mirror layout/config:
  - `mirror-config/config.js`
- Global mirror theme:
  - `mirror-config/custom.css`
- Custom modules:
  - `custom_modules/MMM-ValentineNote`
  - `custom_modules/MMM-OurShow`
  - `custom_modules/MMM-SubwayL`

When you edit these files, run:

```bash
./scripts/sync.sh
```

Then restart MagicMirror.

## Subway L setup

`MMM-SubwayL` reads the official MTA GTFS-realtime L feed.

1. Get an MTA API key.
2. Set `mtaApiKey` in `mirror-config/config.js`.
3. Adjust stop IDs under `stops` if needed.

If no key is configured, the module shows fallback sample times so your layout still looks complete.

## Our Show setup

Edit:

- `custom_modules/MMM-OurShow/data/default-show.json`

Update show title, watched date, summary, and cast image URLs.

## Deploy to Pi later

Copy this repo to Pi, install Node.js LTS, then run the same scripts (`bootstrap.sh`, `run-mac.sh` or `run-server.sh`).
