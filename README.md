# Dependency Brain

`dep-brain` is an npm package that combines dependency analysis signals into one CLI and library.

## Vision

`npm audit + depcheck + dedupe + intelligence = one tool`

## MVP Goals

- Detect duplicate dependencies from lockfiles
- Detect likely unused dependencies from source imports
- Detect outdated packages
- Produce a project health score

## CLI

```bash
npx dep-brain analyze
```

Example output:

```text
Project Health: 61/100

3 duplicate dependencies
2 unused packages
4 outdated libraries

Suggestions:
- Replace moment -> dayjs
- Remove lodash (unused)
```

## Project Structure

```text
src/
|-- cli.ts
|-- index.ts
|-- core/
|   |-- analyzer.ts
|   |-- graph-builder.ts
|   `-- scorer.ts
|-- checks/
|   |-- duplicate.ts
|   |-- unused.ts
|   |-- outdated.ts
|   `-- risk.ts
|-- reporters/
|   |-- console.ts
|   `-- json.ts
`-- utils/
    |-- npm-api.ts
    `-- file-parser.ts
```

## Development

```bash
npm install
npm run build
```

The current scaffold is intentionally lean and ready for MVP iteration.
