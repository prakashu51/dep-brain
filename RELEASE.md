# Release Checklist

This checklist is for `v1.0.0` and later releases.

## Pre-flight

- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm pack` and inspect the tarball contents
- Verify the CLI help includes `--json`, `--md`, `--sarif`, `--baseline`, policy flags, and `report --from`
- Verify `action.yml` points at the built CLI in `dist/cli.js`

## Versioning

- Update `package.json` version
- Update `package-lock.json` version
- Add entries under `CHANGELOG.md`
- Confirm `README.md` and `docs/v1-readiness.md` match shipped behavior

## Publish

- Create and push a `vX.Y.Z` tag
- Let `.github/workflows/publish.yml` publish the package to npm

## Post-publish

- Update any release notes or announcement links
- Smoke test with `npx dep-brain@latest analyze --help`
