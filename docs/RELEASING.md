# Publishing a Voux release

These steps are just for me or anyone else maintaining the repo. Keep it simple.

1. Make sure `master` has everything you want in the release. Run `npm run dev` or whatever checks you need.
2. Decide the version (example `v1.0.2`). Update any public version text if needed.
3. Commit anything pending, then create the tag from the latest commit:
   ```bash
   git tag v1.0.2
   git push origin v1.0.2
   ```
4. GitHub Actions sees the tag, builds the Docker image, and pushes both `latest` and `v1.0.2` to GHCR.
5. GitHub Actions also publishes a release entry titled with the tag and auto-generated notes. You can edit it later if you want custom text.
6. Pull the tag locally (`git fetch --tags`) if you need to test the packaged version.

Need to patch an older release? Check out the old tag, branch from it, make your fix, then tag with a new version (like `v1.0.3`). Never move or delete old tags.
