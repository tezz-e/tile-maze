# Tiltmaze Release Checklist

Comprehensive release and submission checklist for the "Anything but a Game Controller" challenge.

---

## 1. Pre-Flight Verification

Ensure all tests pass and builds complete cleanly before tagging:

```bash
# 1. Run all workspace TypeScript / Vitest unit and integration tests
npm test

# 2. Build production web bundles (packages/protocol, server, and game)
npm run build

# 3. Run Android JVM unit tests
cd app && ./gradlew testDebugUnitTest
```

---

## 2. Build the Android Submission APK

Build the standalone Android package:

```bash
cd app

# Build signed release APK if signing keys are configured in local.properties:
./gradlew assembleRelease

# OR build debug APK (fully functional, zero-configuration):
./gradlew assembleDebug
```

1. Locate the generated APK:
   - Debug: `app/app/build/outputs/apk/debug/app-debug.apk`
   - Release: `app/app/build/outputs/apk/release/app-release-unsigned.apk` (or signed equivalent)
2. Rename the APK to `tiltmaze-v1.0.0.apk`:
   ```bash
   cp app/app/build/outputs/apk/debug/app-debug.apk ./tiltmaze-v1.0.0.apk
   ```

---

## 3. GitHub Release Publication

1. Push all latest commits and tags to GitHub:
   ```bash
   git push origin main
   git tag -a v1.0.0 -m "Release v1.0.0: Anything but a Game Controller submission"
   git push origin v1.0.0
   ```
2. Navigate to [GitHub Releases](https://github.com/tezz-e/tile-maze/releases) and draft a new release:
   - Tag version: `v1.0.0`
   - Release title: `Tiltmaze: Kinetic Edition v1.0.0`
   - Attach `tiltmaze-v1.0.0.apk` as a release binary asset.
3. Verify that the "Download APK" link in `README.md` successfully directs to the asset download.

---

## 4. Clean-Clone Test

Simulate an evaluator cloning and running the project from scratch on a clean machine:

```bash
# 1. Clone into an isolated temporary folder
git clone https://github.com/tezz-e/tile-maze.git /tmp/tiltmaze-clean-test
cd /tmp/tiltmaze-clean-test

# 2. Install dependencies
npm install

# 3. Build workspace packages
npm run build

# 4. Start the unified server
npm start
```

- Verify that `http://localhost:3000` loads the 3D labyrinth, WebGL canvas, HUD, and QR code.
- Verify that keyboard controls (`WASD`, `Space`, `Shift`, `C`) drive the marble.

---

## 5. Submission Artifacts

- [ ] **Screen Recording:** Capture video demonstrating physical phone tilt steering, shake-to-jump, nitro boost, and haptic response.
- [ ] **Demo GIF:** Export short highlight reel to `docs/media/demo.gif`.
- [ ] **Video URL:** Fill in `<VIDEO_URL>` placeholder in `README.md` and `docs/index.html`.
