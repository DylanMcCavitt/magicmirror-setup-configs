# Magic Mirror Agent Surface

This repo keeps the editable MagicMirror config, local agent-snapshot tooling, and Vercel control plane for the mirror.

## Current state

- Pinned MagicMirror runtime (`v2.34.0`) bootstrapped into `runtime/MagicMirror`
- Mirror config includes built-in `clock` and the custom `MMM-AgentSurface` module
- Agent surface display config lives in `mirror-config/config.js`
- Scoped visual tweaks live in `mirror-config/custom.css`
- Sync scripts keep editable source in this repo and copy it into the runtime

## Preview on Mac

Desktop app preview:

```bash
./scripts/run-mac.sh
```

Browser preview:

```bash
./scripts/run-server.sh
```

Then open [http://localhost:8080](http://localhost:8080).

## Quick start

1. Install Node.js LTS, recommended `20.x` or newer.
2. Bootstrap the pinned MagicMirror runtime:

```bash
./scripts/bootstrap.sh
```

3. Start a preview:

```bash
./scripts/run-mac.sh
```

or:

```bash
./scripts/run-server.sh
```

## Agent snapshots, Mirror OS contracts, and Vercel

Config and page-contract validation:

```bash
npm run check:config
npm run check:contracts
```

Local snapshot validation:

```bash
npm run check:snapshot -- --file <snapshot.json>
```

Collect real OMP usage stats and recent session metadata as a snapshot:

```bash
npm run collect:omp-stats
```

Upload a snapshot to the local mirror and optional Vercel validator:

```bash
npm run upload:snapshot -- --file <snapshot.json> --cloud-url https://magicmirror-setup-configs.vercel.app
```


Snapshot uploads target the Vercel endpoint `POST /api/agent-snapshot`.

Environment/source names:

- `MIRROR_INGEST_TOKEN` — bearer token used by the upload client and Vercel ingest API
- `MIRROR_LOCAL_UPLOAD_TOKEN` — optional bearer token accepted by the local `MMM-AgentSurface` upload endpoint
- `MIRROR_AGENT_PROJECT` — optional project label for collected agent work; defaults to `Magic Mirror Agent Surface`
- `MIRROR_CALENDAR_ICS_URL` — calendar ICS feed URL; calendar stays `unconfigured` until this is set
- `MIRROR_WEATHER_LATITUDE` and `MIRROR_WEATHER_LONGITUDE` — Open-Meteo coordinate source; weather stays `unconfigured` until both are set
- `MIRROR_PATH_GTFS_RT_URL` and `MIRROR_PATH_STATION_ID` — PATH GTFS-realtime source; PATH stays `unconfigured` until both are set
- `MIRROR_SPORTS_LEAGUES` and `MIRROR_SPORTS_TEAMS` — sports scoreboard source selectors; sports stays `unconfigured` until both are set

Health checks:

- `GET /health`
- `GET /healthz`
- `GET /status`

## Files to customize next

- `mirror-config/config.js` — active MagicMirror modules and positions
- `mirror-config/custom.css` — scoped visual tweaks
- `custom_modules/MMM-AgentSurface/` — custom agent surface module path

## Ground-up direction

The next build should make the mirror an agent surface, not a generic dashboard:

- Agent threads: show live or recent agent/session threads, statuses, blockers, and outputs.
- Voice: local wake/listen/speak controls for asking the mirror about threads or triggering actions.
- Movement sensor: presence-aware wake/sleep, glance mode, and full detail mode.
- Agent bus: one local service should broker state between MagicMirror modules, agent/thread sources, voice, and sensors so UI modules stay dumb.

Do not add placeholder modules. Add each capability when the data source and runtime behavior are wired end to end.
