# AI Focus Hub Mobile Install (OnePlus Open)

## Option 1: Install now as mobile web app (fastest)

1. On your OnePlus Open, open:
   - https://onyx-agent-cozyhub.web.app
2. In Chrome, tap `⋮` -> `Install app` (or `Add to Home screen` if install is not shown).
3. Confirm install and launch from home screen.

## Option 2: Build Android APK (Capacitor wrapper)

Project already includes Capacitor Android scaffolding.

### 1) Sync Android wrapper

```bash
npm run cap:sync
```

### 2) Open Android Studio

```bash
npm run cap:open:android
```

### 3) Build APK in Android Studio

1. Wait for Gradle sync to complete.
2. Build -> Build Bundle(s) / APK(s) -> Build APK(s).
3. APK output path is typically:
   - `android/app/build/outputs/apk/debug/app-debug.apk`

### 4) Install APK on OnePlus Open

1. Transfer APK to phone (USB, Google Drive, or Nearby Share).
2. Open the APK on phone and install.
3. If prompted, allow `Install unknown apps` for the app opening the APK.
4. Disable that permission again after install.
