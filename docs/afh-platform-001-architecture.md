# AFH-PLATFORM-001 Architecture Decision

## Decision
Use one shared Next.js codebase for UI/logic and package per platform:
- Android (OnePlus Fold): Capacitor wrapper
- macOS (MacBook Pro): Tauri wrapper

This keeps a single product surface while allowing installable binaries and native notification paths.

## Rationale
- Highest code reuse across web, Android, and macOS.
- Minimal UX drift between platforms.
- Keeps app delivery fast while preserving native packaging options.
- Supports notification-oriented workflows already present in AI Focus Hub.

## Tradeoffs
- Platform wrappers add build/release complexity.
- Static export mode constraints must be managed for packaging workflows.
- Tauri tooling must be installed in environments that build macOS artifacts.

## Build and Deploy Steps

### Android (Capacitor)
1. Build static web bundle:
```bash
npm run build:mobile:web
```
2. Sync web assets + native config into Android project:
```bash
npm run android:sync
```
3. Build debug APK:
```bash
npm run android:apk:debug
```
4. Open Android Studio for signing/release:
```bash
npm run cap:open:android
```

### macOS (Tauri)
1. One-time Tauri project bootstrap:
```bash
npm run mac:tauri:init
```
2. Build static web bundle + macOS artifact:
```bash
npm run mac:tauri:build
```
3. Distribute generated `.app`/`.dmg` from Tauri build output.

## Configuration Notes
- `NEXT_OUTPUT_MODE=export` is used for packaging builds.
- `next.config.ts` now enables `output: "export"` only when `NEXT_OUTPUT_MODE=export`.
- Standard web/server workflows remain unchanged (`npm run dev`, `npm run build`).

## Operational Notes
- For mobile wake alarms and reminder UX, current implementation is in-app scheduling with persisted settings.
- Native background notification reliability can be improved later by adding platform notification plugins/jobs.
