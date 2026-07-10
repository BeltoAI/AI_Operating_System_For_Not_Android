# Load and Test SlyOS

This guide is for testing what exists today as close to real device use as possible.

## 1. Supabase Sync Setup

Use one Supabase project for every device.

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

The current iPhone test path is the installable PWA, not a native App Store/TestFlight app yet.

1. Download `slyos-web-pwa-*.zip` from the latest GitHub prerelease.
2. Host the `app/` folder from the ZIP on any HTTPS static host.
3. Open that HTTPS URL in Safari on iPhone.
4. Tap Share.
5. Tap Add to Home Screen.
6. Open SlyOS from the Home Screen.
7. Open Setup.
8. Enter the same Supabase URL, publishable/anon key, email, and password.
9. Tap Configure, Sign in, then Pull brain.

Localhost from your Mac can preview the iPhone UI, but a real iPhone PWA install needs HTTPS.

For cabled iPhone testing on a Mac:

1. Connect the iPhone 15 Pro Max and trust the Mac on the phone.
2. Enable Web Inspector on the iPhone.
3. Enable Safari's Develop menu on the Mac.
4. Open the PWA in Safari on the iPhone.
5. Inspect it from Safari on the Mac.

For native cabled install/debug:

1. Install full Xcode from the App Store.
2. Run `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`.
3. Create/sign the Xcode project and run it on the trusted iPhone.

This repo has a SwiftUI source scaffold under `platforms/ios`, but it does not yet include a generated Xcode project or signed `.ipa`.

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

Use the latest prerelease on GitHub:

```text
https://github.com/BeltoAI/AI_Operating_System_For_Not_Android/releases
```

Download:

- `slyos-web-pwa-*.zip`
- `slyos-desktop-agent-*.zip`

## 8. Current Limits

- iOS full-device click-through is blocked by Apple sandboxing; use PWA/App Intents/Shortcuts/handoff.
- Native signed `.ipa`, `.dmg`, Linux packages, and Windows installers are not finished yet.
- Supabase must be created by you because the repo cannot safely ship project credentials.
- Desktop takeover requires explicit local opt-in with `SLYOS_ENABLE_DEVICE_CONTROL=1`.
