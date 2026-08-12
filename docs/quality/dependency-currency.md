# Dependency currency and compatibility

Project AMANOR uses the newest release that is inside the published support
range of the complete installed toolchain. A registry's newest version is not
adopted by overriding peer dependencies: that would make a green install look
supported when its maintainers explicitly say otherwise.

## Current compatibility decision

Registry metadata and the installed graph were reviewed on 12 August 2026 after
a root `npm outdated` check. Every direct dependency is at its current wanted
release. The only newer versions reported are deliberately held at the latest
supported major:

| Package    | Locked version | Newer registry version | Reason not adopted                                                                                                                                                                                                                                                                                                                                |
| ---------- | -------------: | ---------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ESLint     |         9.39.5 |                 10.8.1 | Next.js 16.3.0 currently installs `eslint-plugin-react@7.37.5`, `eslint-plugin-jsx-a11y@6.10.2` and `eslint-plugin-import@2.32.0`; their published peer ranges stop at ESLint 9. A clean ESLint 10 dry run requires npm peer overrides, then Next's bundled React rule crashes while loading because it still uses the ESLint 9 rule-context API. |
| TypeScript |          6.0.3 |                  7.0.2 | `typescript-eslint@8.67.0`, also used by `eslint-config-next@16.3.0`, publishes `typescript >=4.8.4 <6.1.0`. TypeScript 7 is outside that range.                                                                                                                                                                                                  |

These are compatibility holds, not permanent pins. Dependabot checks npm and
GitHub Actions weekly. Compatible patch and minor updates are grouped; unrelated
majors remain individually reviewable. The known-incompatible ESLint,
`@eslint/js` and TypeScript major lines are ignored so the npm update lane does
not create an internally split toolchain or fail while resolving a rejected
update. When the blocking packages publish support, remove the matching ignore,
update this evidence and upgrade the held major in one reviewed change.

## Required evidence for dependency changes

1. Review registry metadata for engines and every relevant peer range.
2. Update the root lockfile with no forced or legacy peer-dependency mode.
3. Run `npm run check:dependency-policy`; the installed ESLint and TypeScript
   graph must contain no invalid peer edge.
4. Run the complete `npm run check` gate and all independently deployable image
   scans.
5. Record any remaining major-version hold here with its exact upstream range;
   never describe an unsupported forced install as “latest compatible.”
