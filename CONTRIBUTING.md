# Contributing

Thanks for looking. This is a young project, so the most useful contributions are the ones that keep
it small: a bug with a reproduction, a doc that has drifted from the code, or a widget module someone
else would want.

## Getting set up

Node 22+ and pnpm 10. No database to install — the default `DATABASE_URL` uses
[PGlite](https://pglite.dev), an embedded Postgres.

```bash
pnpm install
cp .env.example .env
pnpm build:packages   # the server and examples resolve the packages through dist
pnpm dev
```

`pnpm dev` runs the runtime bundler, the server with the admin panel on `:5055`, the views app on
`:5175`, the example widget on `:5174` and a test page on `:5173`. The [README](README.md) walks
through creating and installing a widget from there.

## Before you open a PR

```bash
pnpm format      # prettier, and CI checks it
pnpm lint
pnpm build:packages && pnpm typecheck
pnpm build
```

CI runs exactly that, plus applying the migrations to an empty database. There is no test suite yet;
until there is, say in the PR what you exercised by hand.

## Where things live

| You want to change                             | Go to                                                         |
| ---------------------------------------------- | ------------------------------------------------------------- |
| How a widget is presented on the page          | `packages/runtime/src/chrome/` — one file per strategy        |
| The config contract, or the shape of a message | `packages/protocol/src/` — then both sides follow             |
| The iframe-side API widget authors use         | `packages/widget-kit/src/`                                    |
| Endpoints, persistence, the admin panel        | `apps/server/`                                                |
| A widget UI                                    | `apps/views/` — `pnpm --filter @web-plugins/views new <name>` |
| A new widget kind an operator can create       | `apps/server/src/db/templates.ts`, then `pnpm db:seed`        |

Two rules the codebase tries to hold to, both aimed at the same thing:

- **A chrome name appears only in `packages/runtime/src/chrome/`.** The host knows there is a
  strategy, not which one. If you find yourself writing `config.chrome === '…'` outside that folder,
  the behaviour belongs in the strategy.
- **A contract is declared once, in `packages/protocol`.** The server and the runtime both import it,
  so there is no second copy to drift.

## Style

Prettier and ESLint decide formatting and the obvious correctness rules, so there is nothing to argue
about there. For comments, the house style is: explain the constraint that is not visible in the code
— why a guard exists, what breaks without it — and leave out anything a reader can see for
themselves.

Commit messages are `Type: summary` (`Fix:`, `Add:`, `Chore:`), present tense.

## Licensing

Split on purpose, so the client side is adoptable and the server side is not trivially re-hosted:

- `packages/protocol`, `packages/runtime`, `packages/widget-kit`, `apps/views` and `examples/*` —
  **MIT**
- `apps/server` — **AGPL-3.0**

Contributions are taken under the licence of the directory they land in. A change that moves code
from `apps/server` into one of the MIT packages relicenses it, so raise that in the PR rather than in
the diff.

## Publishing the MIT packages

Not automated yet, and versions move together:

```bash
pnpm -r --filter "@web-plugins/protocol" --filter "@web-plugins/runtime" \
  --filter "@web-plugins/widget-kit" exec npm version minor
pnpm publish -r --filter "@web-plugins/*" --access public
```

`prepublishOnly` rebuilds each package, and pnpm rewrites the `workspace:^` ranges to real semver on
the way out, so consumers get `^0.1.0` rather than a workspace protocol they cannot resolve.
