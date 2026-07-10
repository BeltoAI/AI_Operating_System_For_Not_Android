# Release Tools

Release scripts live here. They produce local artifacts under `release-artifacts/`, which is ignored by git.

## Web/PWA artifact

```bash
npm run release:web
```

Output:

```text
release-artifacts/slyos-web-pwa-<version>-<commit>.zip
release-artifacts/slyos-web-pwa-<version>-<commit>/
```

This artifact is the current installable cross-device path. It can be hosted anywhere static files are supported, then installed as a PWA on iPhone, macOS, Linux, and Windows.

## Native artifact status

Native release scripts should only be added once the local or CI toolchain can actually produce the artifact:

- iOS: full Xcode app project, Apple signing, archive/export options
- macOS: Rust/Tauri or native Swift app shell, signing/notarization
- Linux: Tauri or native package build, AppImage/deb/rpm targets
- Windows: Tauri or native package build, signer/installer target

Do not publish placeholder native installers.
