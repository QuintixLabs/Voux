# Publishing a Voux release

These steps are just for me or anyone else maintaining the repo. Keep it simple.

1. Make changes/features.
   ```bash
   git commit -m "feat: add..."
   git push -u origin master
   ```
2. Update `package.json` (and any other version text) to the new version, then commit it.
3. Decide the version tag (example `v1.0.2`), then create and push it:
   ```bash
   git tag v1.0.2
   git push origin v1.0.2
   ```
4. GitHub Actions sees the tag, builds the Docker image, and pushes both `latest` and `v1.0.2` to **GHCR**.
5. GitHub Actions also publishes a release entry titled with the tag and auto-generated notes. You can edit it later if you want custom text.
6. Pull the tag locally (`git fetch --tags`) if you need to test the packaged version.

Need to patch an older release? Check out the old tag (`git checkout v1.0.1`), branch from it, make your fix, then tag with a new version (like `v1.0.1`). Never move or delete old tags.
