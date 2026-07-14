# Website Download Copy

Use this on the Android website when the cross-platform release assets are uploaded to the BADSCIENTIST GitHub Release.

## Download links

Android reference APK:

```text
https://github.com/BeltoAI/Ai_Operating_System/releases/latest/download/SlyOS.apk
```

macOS app:

```text
https://github.com/BeltoAI/AI_Operating_System_For_Not_Android/releases/download/v0.1.0-brain.6/slyos-macos-app.zip
```

Desktop control bridge for macOS, Linux, and Windows:

```text
https://github.com/BeltoAI/AI_Operating_System_For_Not_Android/releases/download/v0.1.0-brain.6/slyos-desktop-agent.zip
```

Web/PWA shell for iPhone, iPad, Linux, Windows, and browser testing:

```text
https://github.com/BeltoAI/AI_Operating_System_For_Not_Android/releases/download/v0.1.0-brain.6/slyos-web-pwa.zip
```

iPhone development IPA for the currently provisioned test device only:

```text
https://github.com/BeltoAI/AI_Operating_System_For_Not_Android/releases/download/v0.1.0-brain.6/slyos-ios-dev.ipa
```

Do not present that IPA as a public iPhone installer. Its personal-team profile expires July 18, 2026 and only includes the provisioned test iPhone. Other users must build with their own Apple signing team until a TestFlight/App Store release exists.

Latest release page:

```text
https://github.com/BeltoAI/AI_Operating_System_For_Not_Android/releases/latest
```

## Website install text

```html
<section>
  <h2>Download SlyOS</h2>
  <p>Android is the deepest phone build. macOS is the native desktop launcher. iPhone supports a signed cabled development build plus the PWA install path; public iPhone downloads require TestFlight or the App Store.</p>
  <ul>
    <li><a href="https://github.com/BeltoAI/Ai_Operating_System/releases/latest/download/SlyOS.apk">Download Android APK</a></li>
    <li><a href="https://github.com/BeltoAI/AI_Operating_System_For_Not_Android/releases/download/v0.1.0-brain.6/slyos-macos-app.zip">Download macOS app</a></li>
    <li><a href="https://github.com/BeltoAI/AI_Operating_System_For_Not_Android/releases/download/v0.1.0-brain.6/slyos-desktop-agent.zip">Download desktop control bridge</a></li>
    <li><a href="https://github.com/BeltoAI/AI_Operating_System_For_Not_Android/releases/download/v0.1.0-brain.6/slyos-web-pwa.zip">Download Web/PWA shell</a></li>
  </ul>
</section>
```

## User setup instructions

macOS:

1. Download `slyos-macos-app.zip`.
2. Unzip it.
3. Move `SlyOS.app` to `/Applications` and open it from there.
4. Open Setup and sign into the Supabase account, then select Pull brain.
5. Open Brain -> Settings -> Device permissions and select Request Mac access.
6. Approve Screen Recording and Accessibility, quit SlyOS once, and reopen it.

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
3. Run `npm install && npm run macos:app && npm run apple:xcode` so the latest shared UI is synced into the native project.
4. Open `platforms/apple/SlyOSNative/SlyOSNative.xcodeproj`.
5. Select `SlyOS-iOS`, pick the connected iPhone, set signing, and press Run.

Current iOS limit:

Third-party iOS apps cannot take over the entire phone or click through other apps like Android Accessibility can. The iPhone build uses the same SlyOS brain/UI inside the app plus implemented App Intents, Shortcuts handoffs, native contacts/calendar/reminders, camera/imports, and explicit compose/share surfaces.
