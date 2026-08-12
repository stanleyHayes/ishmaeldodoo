# GitHub repository governance

- Repository: `stanleyHayes/ishmaeldodoo`
- Default branch: `main`
- Verified at: `2026-08-12T02:07:32Z`
- Active history ruleset: `20725073` (`Protect main history`)
- Ruleset evidence: `https://github.com/stanleyHayes/ishmaeldodoo/rules/20725073`
- Native security state verified at: `2026-08-12T02:09:01Z`
- Private vulnerability reporting: `Enabled`
- Dependabot security updates: `Enabled`
- Secret scanning and push protection: `Enabled`
- Non-provider pattern scanning and validity checks: `Unavailable/disabled`
- GitHub deployment namespaces: `preview`, `staging`, `production`
- Staging/production branch policy: `Protected branches only`
- Preview branch policy: `Any branch for pull-request previews`

The active repository ruleset targets only `refs/heads/main`, has no bypass
actors and blocks branch deletion plus non-fast-forward updates. Authorized
fast-forward pushes remain possible because the current delivery workflow is
direct-to-main. Secret scanning and push protection were also enabled when this
state was verified. Dependabot security updates and private vulnerability
reporting are enabled; [SECURITY.md](../../SECURITY.md) directs researchers to
the private advisory channel. GitHub did not retain requests to enable
non-provider pattern scanning or validity checks for this repository, so both
remain explicitly unavailable/disabled rather than being claimed as controls.

GitHub environment namespaces now mirror the three remote phases in the
deployment contract. `staging` and `production` allow deployment only from
protected branches; `preview` remains branch-agnostic so pull-request preview
revisions can be represented. These namespaces contain no secrets, variables,
reviewers or deployments and no workflow currently targets them. They are
trust-boundary preparation, not evidence that Render, Vercel, MongoDB,
Cloudinary or any other provider environment is provisioned.

## Deployment-environment integration record

- Status: `Not integrated`
- Preview workflow/job and pull-request deployment evidence: `Not recorded`
- Staging workflow/job and protected-main deployment evidence: `Not recorded`
- Production workflow/job and approved-promotion evidence: `Not recorded`
- Web/Admin/API provider resources mapped per namespace: `Not provisioned`
- Environment-scoped secret and variable inventory reconciliation: `Not run`
- Preview/staging noindex and edge-access verification: `Not run`
- Production indexing and custom-domain verification: `Not run`
- Staging and production required reviewers: `Not approved`
- Self-review prevention and emergency bypass policy: `Not approved`
- Deployment history, exact revision and provider-release linkage: `Not run`
- Environment deletion/rename protection and recovery procedure: `Not approved`
- Deployment Engineering/Operations approval and date: `Not approved`
- Deployment Security approval and date: `Not approved`
- Deployment Product acceptance and date: `Not approved`

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
