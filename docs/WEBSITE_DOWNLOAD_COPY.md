# Website Download Copy

Use this on the Android website when the cross-platform release assets are uploaded to the BADSCIENTIST GitHub Release.

## Download links

Android reference APK:

```text
https://github.com/BeltoAI/Ai_Operating_System/releases/latest/download/SlyOS.apk
```

macOS app:

```text
https://github.com/BeltoAI/AI_Operating_System_For_Not_Android/releases/download/v0.1.0-brain.1/slyos-macos-app.zip
```

Desktop control bridge for macOS, Linux, and Windows:

```text
https://github.com/BeltoAI/AI_Operating_System_For_Not_Android/releases/download/v0.1.0-brain.1/slyos-desktop-agent.zip
```

Web/PWA shell for iPhone, iPad, Linux, Windows, and browser testing:

```text
https://github.com/BeltoAI/AI_Operating_System_For_Not_Android/releases/download/v0.1.0-brain.1/slyos-web-pwa.zip
```

Latest release page:

```text
https://github.com/BeltoAI/AI_Operating_System_For_Not_Android/releases/latest
```

## Website install text

```html
<section>
  <h2>Download SlyOS</h2>
  <p>Android is the deepest phone build. macOS is the native desktop launcher. iPhone currently supports the native cabled developer build and the PWA install path.</p>
  <ul>
    <li><a href="https://github.com/BeltoAI/Ai_Operating_System/releases/latest/download/SlyOS.apk">Download Android APK</a></li>
    <li><a href="https://github.com/BeltoAI/AI_Operating_System_For_Not_Android/releases/download/v0.1.0-brain.1/slyos-macos-app.zip">Download macOS app</a></li>
    <li><a href="https://github.com/BeltoAI/AI_Operating_System_For_Not_Android/releases/download/v0.1.0-brain.1/slyos-desktop-agent.zip">Download desktop control bridge</a></li>
    <li><a href="https://github.com/BeltoAI/AI_Operating_System_For_Not_Android/releases/download/v0.1.0-brain.1/slyos-web-pwa.zip">Download Web/PWA shell</a></li>
  </ul>
</section>
```

## User setup instructions

macOS:

1. Download `slyos-macos-app.zip`.
2. Unzip it.
3. Open `SlyOS.app`.
4. If macOS blocks the unsigned local build, Control-click the app, click Open, then Open again.
5. Open Setup.
6. Create/sign into the Supabase account.
7. Click Pull brain.

Desktop control bridge:

1. Download `slyos-desktop-agent.zip`.
2. Unzip it.
3. Run `npm install`.
4. Start the agent with `SLYOS_AGENT_TOKEN=choose-a-local-secret SLYOS_ENABLE_DEVICE_CONTROL=1 npm run start`.
5. Grant Accessibility and Screen Recording permissions on macOS, or the matching UI automation/screen permissions on Linux/Windows.
6. In SlyOS Setup, enter `http://127.0.0.1:4317` and the same token.
7. Click Check bridge.

iPhone PWA:

1. Download `slyos-web-pwa.zip`.
2. Host the `app/` folder on HTTPS.
3. Open the HTTPS URL in Safari on iPhone.
4. Tap Share, then Add to Home Screen.
5. Open SlyOS, sign in, and Pull brain.

iPhone native developer build:

1. Install full Xcode.
2. Clone the BADSCIENTIST repo.
3. Run `npm install && npm run apple:xcode`.
4. Open `platforms/apple/SlyOSNative/SlyOSNative.xcodeproj`.
5. Select `SlyOS-iOS`, pick the connected iPhone, set signing, and press Run.

Current iOS limit:

Third-party iOS apps cannot take over the entire phone or click through other apps like Android Accessibility can. The iPhone build uses the same SlyOS brain/UI inside the app, plus future App Intents, Shortcuts, share sheets, camera/imports, and explicit handoff.
