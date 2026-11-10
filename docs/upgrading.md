# Upgrading eigen.beam

Upgrade one released image to another only after reading the target release's changelog section and taking a database backup.

## Versioning and breaking changes

eigen.beam uses semantic versions. A release is a **major** version when it adds a required environment variable or includes a non-additive database migration. Additive tables, nullable columns and compatible indexes may ship in a minor release. Backward-compatible fixes ship in a patch release.

Every versioned changelog section must contain this heading, even when no operator action is required:

```markdown
### Upgrade notes

No operator action required.
```

## Before upgrading

1. Stop new deploys and wait until no live presentation is running. A restart ends in-memory rooms.
2. Record the current image tag and the latest filename in `schema_migrations`.
3. Create a Postgres backup using your provider's snapshot/PITR feature or `pg_dump --format=custom --no-owner --file=eigenbeam-before-<version>.dump "$DATABASE_URL"`.
4. Verify that the backup exists and that you know how to restore it into a separate database.
5. Read the target release's **Upgrade notes** and confirm every newly required environment variable is set.

## Upgrade

Start the new image with its normal environment. `EB_MIGRATE_ON_BOOT=true` is the default: boot takes the migration lock, applies pending files and starts the app only after success. Alternatively, run `docker run --rm --env-file eigenbeam.env <image> migrate`, then start the app with `EB_MIGRATE_ON_BOOT=false`.

Do not route traffic until `/readyz` returns `200`. `/healthz` proves only that the process is alive.

## Rollback window

Redeploying the previous image is safe only while every migration applied by the new version is additive and the old image can read the resulting schema. The window closes when either condition becomes true:

- a non-additive migration changes or removes data/schema needed by the old image;
- the new image writes data the old image cannot interpret.

Inside the window, redeploy the previous image and keep the additive schema. Outside it, stop the app and restore the pre-upgrade backup into a clean database. Never delete rows from `schema_migrations` or manually reverse production SQL without a reviewed down-migration plan.

## Restore

1. Stop all app instances so no writes race the restore.
2. Create a clean target database; do not restore over the failed database.
3. Restore the provider snapshot, or run `pg_restore --clean --if-exists --no-owner --dbname="$RESTORE_DATABASE_URL" eigenbeam-before-<version>.dump`.
4. Point the previous image at the restored database and keep `EB_MIGRATE_ON_BOOT=false` for the first validation boot.
5. Confirm `/healthz` and `/readyz`, then run the ops smoke before reopening traffic.

## Moving data between environments

The supported minimum path is a Postgres backup/restore from a lower environment into production during a planned maintenance window. Local file decks, local assets and the outbox are not a production migration format; move them through product exports/uploads or a separately reviewed migration tool.
