# Privileged role and permission matrix

- Status: Engineering review; Product and independent Security approval required
- Scope: AMANOR-114 and privileged web, Admin/CMS and NestJS operations
- Rule: permissions are checked by the API; navigation visibility is not authorisation

## Runtime roles

| Role                   | Allowed responsibilities                                                                                       | Explicitly forbidden                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Principal              | All current permissions; final Protocol Desk decisions; identity management; security administration           | Cannot bypass two-person publication where the Principal authored policy-sensitive content; Room access still requires future hardware-key/step-up controls |
| Desk Officer           | Read published/governed content needed for operations; triage, correspondence, holds, blackouts and Desk notes | Final accept/decline, identity editing, CMS publishing, Legacy, Security, Press management and The Room                                                     |
| Editor                 | Read and draft CMS content; govern general media                                                               | Publish, approve own policy content, Protocol Desk, Legacy, Security and The Room                                                                           |
| Translator             | Read content and edit locale translations                                                                      | Authoritative English changes, publication, Protocol Desk, media governance, Legacy, Security and The Room                                                  |
| Reviewer               | Read, review and publish eligible content subject to workflow separation                                       | Draft editing, Protocol Desk, identity management, Legacy, Security and The Room                                                                            |
| Press Officer          | Read governed content; manage Press media/portraits through the media boundary                                 | General CMS authoring/publishing, Protocol Desk, Legacy, Security and The Room                                                                              |
| Trust Administrator    | Read governed content; manage Legacy/scholar records and relevant governed media                               | Other CMS workflows, Press, Protocol Desk, Security and The Room                                                                                            |
| Security Administrator | Read minimum governed context; accounts, roles, sessions and redacted authentication audit                     | Content authoring/publishing, Press, Protocol Desk, Legacy and Room decryption                                                                              |

The Room designate is not represented as a reusable platform role. AMANOR-093/096 must model a single explicit, expiring designation tied to hardware-backed MFA and fresh step-up, so assigning an ordinary role can never grant Room access.

## Permission mapping

| Permission          | Principal | Desk | Editor | Translator | Reviewer | Press | Trust | Security |
| ------------------- | :-------: | :--: | :----: | :--------: | :------: | :---: | :---: | :------: |
| `content:read`      |    yes    | yes  |  yes   |    yes     |   yes    |  yes  |  yes  |   yes    |
| `content:write`     |    yes    |  no  |  yes   |     no     |    no    |  no   |  no   |    no    |
| `content:translate` |    yes    |  no  |   no   |    yes     |    no    |  no   |  no   |    no    |
| `content:review`    |    yes    |  no  |   no   |     no     |   yes    |  no   |  no   |    no    |
| `content:publish`   |    yes    |  no  |   no   |     no     |   yes    |  no   |  no   |    no    |
| `desk:operate`      |    yes    | yes  |   no   |     no     |    no    |  no   |  no   |    no    |
| `identity:manage`   |    yes    |  no  |   no   |     no     |    no    |  no   |  no   |    no    |
| `legacy:manage`     |    yes    |  no  |   no   |     no     |    no    |  no   |  yes  |    no    |
| `press:manage`      |    yes    |  no  |   no   |     no     |    no    |  yes  |  no   |    no    |
| `security:manage`   |    yes    |  no  |   no   |     no     |    no    |  no   |  no   |   yes    |

## Enforcement requirements

- Controllers and application services require explicit permissions or narrower domain roles; deny when no recognised role grants the action.
- General CMS drafts require `content:write`; translators may create a new version only for an existing document and may change only `fr-FR` values, including French translation status. They cannot change authoritative English, identifiers, structure or non-localised fields.
- Identity drafts require `identity:manage`; Scholar drafts require `legacy:manage`; Blackout, Counterparty and Desk Configuration drafts require `desk:operate`. These narrower domain permissions do not grant general CMS authoring.
- Authors may submit only their own versions. Requesting changes and approval require `content:review`; scheduling, publishing, rollback, superseding and unpublishing require `content:publish`.
- Multi-role accounts receive the union of permissions, but workflow rules such as author/approver separation and Principal-only final decisions remain independent constraints.
- Role changes increment the role version and revoke active sessions immediately.
- Privileged invitation requires MFA enrollment and five-minute recent-MFA step-up. The implemented hashed single-use recovery and step-up baseline remains pending provider notification, recovery drill and independent AMANOR-116 approval.
- Database users, provider credentials and deployment access are service identities, not human roles, and require separate least-privilege policies.
- Every new endpoint must name its permission and add allowed/denied role tests. The Admin must hide irrelevant navigation but API denial is the acceptance evidence.

## Review gaps

Product must confirm the Press Officer and Trust Administrator operational boundaries and whether identity edits require a dedicated reviewed workflow rather than Principal-only authority. Security must approve multi-role assignment rules, high-risk step-up actions, break-glass access and quarterly access review. The Room role/designation remains intentionally unavailable until its cryptographic and access model is approved.
