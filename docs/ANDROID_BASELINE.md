# Android Baseline

Source of truth:

```text
/Users/emilshirokikh/Downloads/MADSCIENTIST/agentos
```

BADSCIENTIST should not move or rewrite that production tree until the cross-platform structure is proven. The existing Android deployment path is path-sensitive and release-sensitive.

## Current Android production loop

The known working flow is:

```bash
cd ~/Downloads/MADSCIENTIST/agentos
rm -f .git/HEAD.lock
git add -A
git commit -m "..."
git push origin main
cd android
./gradlew :AgentShell:installDebug
adb shell am force-stop com.agentos.shell
sleep 1
adb shell monkey -p com.agentos.shell -c android.intent.category.LAUNCHER 1
```

## Why not move Android yet

Moving `agentos/android` into this repo now would likely break or require edits to:

- Gradle command paths
- GitHub release workflow path filters
- website/docs publishing paths
- scripts that assume the current repo root
- APK packaging scripts
- ADB install scripts
- README and download links

## Android capability reference

The Android app is the richest platform because it can use:

- HOME launcher replacement
- Compose full-screen shell
- NotificationListenerService and RemoteInput replies
- AccessibilityService for screen reading and gesture execution
- overlay navigation service
- SMS intents and calendar APIs
- camera, microphone, contacts, files, and package queries
- optional Device Owner mode
- ADB install and local device testing

Every non-Android platform should be evaluated against this baseline.

