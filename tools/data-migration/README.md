# Android Brain Migration

The Mac and iPhone apps can restore the real archive produced by Android SlyOS `BrainBackup` and uploaded by Android `BrainCloud`.

## Automatic cloud restore

1. Sign in on Android, Mac, and iPhone with the same Supabase account.
2. Let Android complete a Brain backup so the private Storage object `brains/<user-id>/brain.zip` exists.
3. Open Mac or iPhone SlyOS. Account sync pulls both the granular tables and the full private archive.
4. The archive is imported only when its SHA-256 hash changes. Converted portable records are then queued for granular cross-device sync.

The native Apple bundle includes the SQL.js WebAssembly runtime, so Android SQLite databases are read locally even though the app shell runs from `file://`.

## Manual import

1. In Android SlyOS, open `Brain -> Settings -> Brain backup` and run a backup.
2. Locate `Downloads/SlyOS/slyos-brain-YYYYMMDD-HHMM.zip` on the phone.
3. Move that ZIP to the Mac with USB file transfer, Google Drive, or another private transfer.
4. In Mac or iPhone SlyOS, open `Brain -> Settings -> Brain backup`.
5. Choose `Restore file` and select the Android ZIP.
6. Review the import count. When signed in, SlyOS schedules the converted brain for Supabase sync.

The importer runs locally in the app. It reads Android profile and learned facts, `MemoryLog`, checklist,
paper index, searchable messages, top message contacts, expenses, LinkedIn network count, and Cowork
text files. API keys and bank-vault secrets are deliberately not copied into portable settings.

Android's full message database can be far larger than browser storage. Raw messages remain searchable,
while the graph view caps message and contact nodes so it stays interactive. Keep the original ZIP as the
lossless archive; the converted graph is a searchable, bounded cross-device view.

## Privacy

- Never commit an Android backup or converted private data.
- Keep backups in an encrypted local folder or a private cloud drive.
- Delete temporary transferred copies after confirming the import.
- The repository ignores `private-data/`; that folder is appropriate for local-only test backups.
