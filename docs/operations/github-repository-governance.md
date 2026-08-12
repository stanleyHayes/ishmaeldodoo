# GitHub repository governance

- Repository: `stanleyHayes/ishmaeldodoo`
- Default branch: `main`
- Verified at: `2026-08-12T02:07:32Z`
- Active history ruleset: `20725073` (`Protect main history`)
- Ruleset evidence: `https://github.com/stanleyHayes/ishmaeldodoo/rules/20725073`

The active repository ruleset targets only `refs/heads/main`, has no bypass
actors and blocks branch deletion plus non-fast-forward updates. Authorized
fast-forward pushes remain possible because the current delivery workflow is
direct-to-main. Secret scanning and push protection were also enabled when this
state was verified.

This is a history-integrity control, not a claim that post-push CI is a
pre-merge gate. `Quality` and `CodeQL SAST` currently run on pushes to `main`
and pull requests. Adding required status checks or a pull-request requirement
would change the delivery model and must be made together with the reviewed
transition below so that enforcement cannot deadlock all authorized releases.

## Required-check transition record

- Status: `Not approved`
- Delivery-model owner and decision reference: `Not recorded`
- Pull-request or merge-queue workflow selected: `Not selected`
- Required `Quality` check name and successful trial run: `Not recorded`
- Required CodeQL check names and successful trial runs: `Not recorded`
- Required approving-review count and code-owner policy: `Not approved`
- Stale-review dismissal and conversation-resolution policy: `Not approved`
- Administrator/bypass actors and emergency procedure: `Not approved`
- Signed-commit requirement decision: `Not approved`
- Linear-history requirement decision: `Not approved`
- Ruleset export before/after and rollback procedure: `Not recorded`
- Failed-check, stale-review and emergency-release drills: `Not run`
- Engineering approval and date: `Not approved`
- Security approval and date: `Not approved`
- Product/Operations acceptance and date: `Not approved`

Until this transition is approved and executed, release-candidate entry still
requires one independent approving review plus a successful hosted pipeline for
the exact immutable revision. Do not describe the active history ruleset as
required-check enforcement, and do not disable it to work around a failed push.
