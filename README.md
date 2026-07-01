# Magic Mirror Agent Surface

This repo is reset to a clean MagicMirror scaffold so the next customization can be built from the ground up.

## Current state

- Pinned MagicMirror runtime (`v2.34.0`) bootstrapped into `runtime/MagicMirror`
- Minimal config in `mirror-config/config.js`
- Empty custom stylesheet in `mirror-config/custom.css`
- No checked-in custom modules
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

## Vercel Docker

This repo includes a minimal Vercel Docker control plane:

- `Dockerfile.vercel`
- `vercel/status-server.mjs`

Deploy preview:

```bash
vercel deploy
```

Deploy production:

```bash
vercel deploy --prod
```

Health checks:

- `GET /health`
- `GET /healthz`
- `GET /status`

The Pi still runs MagicMirror, sensors, voice, and local agent collection. Vercel hosts the HTTP control plane only.

## Files to customize next

- `mirror-config/config.js` — active MagicMirror modules and positions
- `mirror-config/custom.css` — global visual system
- `custom_modules/` — future custom modules, created only when the implementation is real

## Ground-up direction

The next build should make the mirror an agent surface, not a generic dashboard:

- Agent threads: show live or recent agent/session threads, statuses, blockers, and outputs.
- Voice: local wake/listen/speak controls for asking the mirror about threads or triggering actions.
- Movement sensor: presence-aware wake/sleep, glance mode, and full detail mode.
- Agent bus: one local service should broker state between MagicMirror modules, agent/thread sources, voice, and sensors so UI modules stay dumb.

Do not add placeholder modules. Add each capability when the data source and runtime behavior are wired end to end.
