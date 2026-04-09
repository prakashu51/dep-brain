# Release Checklist

This checklist is for `v0.1.0` and later releases.

## Pre-flight

- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm pack` and inspect the tarball contents

## Versioning

- Update `package.json` version
- Add entries under `CHANGELOG.md`

## Publish

- `npm login`
- `npm publish`

## Post-publish

- Tag the release in GitHub
- Update any release notes or announcement links
