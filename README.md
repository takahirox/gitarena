# GitArena

Compare two Git commits as independently usable web apps, capture either view, and save visual feedback tied to the exact source commit.

## Run the MVP

Requirements: Node.js 22+, Git, Docker Engine/Desktop (Docker 28+ for localhost-only port publishing), and desktop Chrome or Edge for snapshot capture. Docker must be accessible to your user. The server runs locally; there is no hosted service or AI dependency.

```sh
npm ci
# Pull the runtime image explicitly. GitArena does not pull images automatically.
docker pull node:22-bookworm-slim
npm start
```

Open **http://127.0.0.1:4173**. Use that exact address (not `localhost`). Choose a local repository and two refs: branches, tags, full SHAs, or expressions such as `HEAD~1`. GitArena resolves both to immutable commit SHAs, clones the committed data into its own directory, and creates two detached worktrees. Uncommitted source edits are excluded.

For a dependency-free runnable example, in a second terminal:

```sh
npm run example
```

This prints a newly generated repository path containing two counter versions. Enter that path, choose `HEAD~1` and `HEAD`, open **Launch configuration**, and set:

| Setting | Example |
| --- | --- |
| Container image | `node:22-bookworm-slim` |
| Install command | `true` |
| Start command | `node server.cjs` |
| App port | `3000` |
| Readiness path | `/` |
| Timeout | `120` seconds |
| Host ports | `0` for both (automatic) |

Launch, increment either counter, and try **Swap sides**. **Capture & annotate** opens the browser sharing picker: select **this GitArena tab**, not an individual app tab, window, or screen. GitArena verifies the selected tab, crops the app panel from its actual current view, and immediately stops sharing. Keep the full panel visible while capturing. The snapshot editor offers pen, circle/region, arrow, undo, clear, and a comment. Saving retains the original PNG and normalized annotation geometry separately. The **Feedback** library reopens saved views after stopping, reloading, or restarting GitArena.

Use **Choose commits** to switch targets; launching another comparison stops the current one first. Only one comparison (two apps) runs at a time. Swapping changes display order while retaining each target's identity and feedback provenance. Closing the browser tab leaves apps running so the comparison can be reopened; use **Stop** or stop the Node server to release resources. The generated example repository belongs to you; remove it manually when finished.

## Configure your app

Commands execute in `/app` inside each container through `/bin/sh`, never on the host. The default image supports Node applications; another pre-pulled image must provide `/bin/sh`, `cp`, `rm`, and UID/GID 1000 access. Install dependencies from a committed lockfile (`npm ci` by default), then start the app (`npm start` by default). Use `true` to skip installation. Both versions share the selected configuration and have separate filesystems, dependencies, and host ports. Container `PORT` and `HOST=0.0.0.0` are set; your application must honor them or accept explicit command flags, e.g. `npm run dev -- --host 0.0.0.0 --port 3000`.

Host ports are allocated by Docker unless explicitly chosen (1024–65535, distinct and unused). Readiness polls the configured path for a 2xx HTTP response within the timeout (5–600 seconds). Redirects do not count as ready. The app must serve its initial view at `/`. Bind to all container interfaces; binding to container `localhost` will time out. Dependency installation counts against the timeout. Errors include the failing side, actionable hints, and bounded recent container output. Apps that exit after startup cause both targets to stop.

The apps are embedded cross-origin in sandboxed iframes, allowing scripts, forms, and modals. Top-level navigation, popups, camera, microphone, and display capture are unavailable to them. Remove `X-Frame-Options` in the app's **local preview configuration** and allow `http://127.0.0.1:4173` in CSP `frame-ancestors`. GitArena rejects incompatible initial response headers and root redirects with an explanation; it does not strip security headers. Later navigation, login flows, third-party pages, browser cookie policy, or runtime-generated restrictions may still prevent embedding; configure a preview route in your app rather than weakening production headers. HTTPS-only applications and external service orchestration are outside this MVP's supported launch model.

`GITARENA_PORT` changes the local UI port. `GITARENA_DATA` changes the data directory (default `.gitarena/` relative to the server working directory). Keep that directory stable across restarts. It contains private session records, feedback JSON with PNGs, and temporary worktrees. Do not put credentials into launch commands: session configuration is persisted. There is no environment/credential forwarding. Back up the `feedback/` and `sessions/` subdirectories together to retain feedback and comparison history. Do not run two servers on the same data directory.

## Isolation and cleanup

See [architecture and trust boundaries](docs/architecture.md). App code runs only inside containers with a read-only root filesystem, read-only committed source mount, UID 1000, dropped Linux capabilities, no privilege escalation, and CPU/memory/process limits. No Docker socket, source repository metadata, home directory, or host credentials are mounted. Writable app/dependency storage is limited to a 512 MiB tmpfs and temporary storage to 128 MiB; each container has 1 CPU, 1 GiB memory including tmpfs, no extra swap, and at most 256 processes. Apps exceeding these limits need a smaller preview workload for this MVP.

Containers have outbound networking for dependency installation and app requests. They can access services reachable from Docker's network, including some host services; containers share the Docker kernel. This is a local development tool, **not a sandbox for actively hostile code**. Run Docker and GitArena in a dedicated disposable VM with restricted network egress for adversarial repositories. Do not expose the UI or app ports to other users. Git and Docker themselves remain trusted host tools; very large repositories can consume host clone storage.

**Stop**, startup failure, timeout, and SIGINT/SIGTERM/SIGHUP remove both owned containers before deleting their private clone/worktrees. Original repositories are never cleaned, reset, or pruned. Abrupt process termination or power loss cannot run cleanup immediately: on the next start with the same data directory, GitArena removes interrupted sessions' resources before serving requests. Restore Docker access if recovery fails. If Docker is unavailable during Stop, metadata and worktrees stay intact for a retry; launching another session is blocked. Do not delete the data directory before recovery, since its journal identifies owned resources. Only containers labeled for this data directory and session are removed; unrelated containers are never pruned.

For emergency cleanup while the server is stopped, inspect `sessions/*.json` and the owned container names `gitarena-<data-directory-hash>-<session-id>-left/right`. Remove only those two containers, then restart normally. Saved feedback remains available. A stale `server.lock` is recovered automatically when its recorded process no longer exists; if the PID was reused, verify that process before manually removing the lock.

## Validation

```sh
npm test                       # Git, lifecycle, persistence, API/security tests
npx playwright install chromium
npm run test:ui                # Browser interaction + capture/editor/persistence
npm run test:docker            # Real isolated launches; Docker + pulled image required
npm run check                  # Syntax and diff whitespace
```

UI tests exercise the capture/cropping implementation, annotation UI, API, and disk persistence using a synthetic stream, plus a native Chromium tab-capture test that automatically accepts the picker using a test-only browser flag. Docker tests launch the committed counter app, inspect isolation settings, and verify cleanup for startup failures, embedding rejection, readiness timeout, cancellation, and process interruption. The native OS/browser sharing picker still requires selecting the GitArena tab during normal use.

## Contributing

Follow the [development flow](docs/development-flow.md), [review guidelines](docs/review-guidelines.md), and [agent instructions](AGENTS.md). Use English for new collaboration content.

- [Issue template](.github/ISSUE_TEMPLATE/issue.md)
- [Pull request template](.github/pull_request_template.md)
