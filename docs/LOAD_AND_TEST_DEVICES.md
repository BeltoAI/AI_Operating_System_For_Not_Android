# Load and Test SlyOS

This guide is for testing what exists today as close to real device use as possible.

## 1. Supabase Sync Setup

Use one Supabase project for every device. The current app is prefilled with the SlyOS test project:

```text
https://xfftheaprdedypqlcvzg.supabase.co
```

Open `Setup` in SlyOS, create/sign into an account with email and password, then use:

- `Pull brain` on a new device
- `Push brain` after creating/updating local memory/settings

For a self-hosted Supabase project:

1. Create a Supabase project.
2. Open the SQL editor.
3. Paste and run the full contents of `supabase/schema.sql`.
4. Open Authentication settings.
5. Enable Email auth with password signups/signins.
6. Copy the Project URL.
7. Copy the publishable/anon key.

Do not put the service-role key into any app.

## 2. Android Phone

Android is still the reference build.

```bash
cd /Users/emilshirokikh/Downloads/MADSCIENTIST/agentos
cd android
./gradlew :AgentShell:installDebug
adb shell am force-stop com.agentos.shell
adb shell monkey -p com.agentos.shell -c android.intent.category.LAUNCHER 1
```

Inside Android SlyOS, configure the same Supabase URL/anon key and sign into the same account.

## 3. iPhone

There are two iPhone paths today.

### Native cabled app

1. Connect the iPhone and trust the Mac on the phone.
2. Unlock the iPhone and leave it on the home screen.
3. Enable Developer Mode on iPhone.
4. Run:

```bash
cd /Users/emilshirokikh/Downloads/BADSCIENTIST
npm run apple:xcode
xcodebuild \
  -project platforms/apple/SlyOSNative/SlyOSNative.xcodeproj \
  -scheme SlyOS-iOS \
  -configuration Debug \
  -destination 'generic/platform=iOS' \
  DEVELOPMENT_TEAM=YOUR_TEAM_ID \
  CODE_SIGN_STYLE=Automatic \
  build
```

Find the device:

```bash
xcrun devicectl list devices
```

Install and launch:

```bash
xcrun devicectl device install app --device YOUR_COREDEVICE_ID \
  ~/Library/Developer/Xcode/DerivedData/SlyOSNative-*/Build/Products/Debug-iphoneos/SlyOS.app

xcrun devicectl device process launch --device YOUR_COREDEVICE_ID com.belto.slyos.ios
```

If `devicectl` shows the phone as `unavailable` or `tunnelState: unavailable`, unplug/replug the cable, unlock the phone, accept Trust prompts, and rerun `xcrun devicectl list devices`.

### PWA fallback

1. Download `slyos-web-pwa-*.zip` from the latest GitHub release.
2. Host the `app/` folder from the ZIP on any HTTPS static host.
3. Open that HTTPS URL in Safari on iPhone.
4. Tap Share.
5. Tap Add to Home Screen.
6. Open SlyOS from the Home Screen.
7. Open Setup.
8. Sign in, then Pull brain.

Localhost from your Mac can preview the iPhone UI, but a real iPhone PWA install needs HTTPS.

For Safari inspection:

1. Connect the iPhone 15 Pro Max and trust the Mac on the phone.
2. Enable Web Inspector on the iPhone.
3. Enable Safari's Develop menu on the Mac.
4. Open the PWA in Safari on the iPhone.
5. Inspect it from Safari on the Mac.

## 4. MacBook

From this repo:

```bash
cd /Users/emilshirokikh/Downloads/BADSCIENTIST
npm install
SLYOS_AGENT_TOKEN=choose-a-local-secret SLYOS_ENABLE_DEVICE_CONTROL=1 npm run agent
```

In a second terminal:

```bash
cd /Users/emilshirokikh/Downloads/BADSCIENTIST
npm run dev
```

Open:

```text
http://localhost:5173
```

In SlyOS:

1. Open Setup.
2. Add Supabase URL/key/email/password.
3. Configure and Sign in.
4. Pull brain.
5. Add the device bridge URL `http://127.0.0.1:4317`.
6. Add the agent token.
7. Check bridge.
8. Prompt from Home with a screen/app/click/control task.
9. Use Run device loop.

For stronger macOS pointer automation:

```bash
brew install cliclick
```

Then grant Terminal or your runner Accessibility and Screen Recording permissions in macOS Settings.

Close and reopen the Mac launcher quickly:

```bash
pkill -x SlyOS
open /Users/emilshirokikh/Downloads/BADSCIENTIST/platforms/macos/build/SlyOS.app
```

You can also focus the SlyOS window and press `Cmd+Q`.

## 5. Linux PC

Download the latest release ZIPs or clone the repo.

```bash
git clone https://github.com/BeltoAI/AI_Operating_System_For_Not_Android.git
cd AI_Operating_System_For_Not_Android
npm install
SLYOS_AGENT_TOKEN=choose-a-local-secret SLYOS_ENABLE_DEVICE_CONTROL=1 npm run agent
```

In a second terminal:

```bash
npm run dev
```

Open `http://localhost:5173`, configure Supabase, then configure the local bridge.

Recommended for X11 automation:

```bash
sudo apt install xdotool gnome-screenshot xclip
```

Wayland support depends on your compositor. Add `wtype`, `wl-copy`, and `wl-paste` where available.

## 6. Windows PC

Install Node.js 22 or newer, then:

```powershell
git clone https://github.com/BeltoAI/AI_Operating_System_For_Not_Android.git
cd AI_Operating_System_For_Not_Android
npm install
$env:SLYOS_AGENT_TOKEN="choose-a-local-secret"
$env:SLYOS_ENABLE_DEVICE_CONTROL="1"
npm run agent
```

In a second PowerShell:

```powershell
npm run dev
```

Open `http://localhost:5173`, configure Supabase, then configure the local bridge.

## 7. Latest Downloads

Use the latest release on GitHub:

```text
https://github.com/BeltoAI/AI_Operating_System_For_Not_Android/releases
```

Download:

- `slyos-web-pwa-*.zip`
- `slyos-desktop-agent-*.zip`
- `slyos-macos-app-*.zip`

## 8. Current Limits

- iOS full-device click-through is blocked by Apple sandboxing; use native in-app flows, App Intents/Shortcuts/handoff, camera/imports, and explicit share sheets.
- Public `.ipa`, `.dmg`, Linux packages, and Windows installers are not finished yet.
- The default Supabase URL/key is publishable and safe to ship, but the service-role key must never be committed.
- Desktop takeover requires explicit local opt-in with `SLYOS_ENABLE_DEVICE_CONTROL=1`.
