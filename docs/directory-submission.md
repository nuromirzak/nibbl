# Anthropic directory submission

What to enter in the developer portal at [claude.ai/directory/manage](https://claude.ai/directory/manage) (Submit new, Plugin bundle), and how nibbl meets the [Anthropic Software Directory Policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy). Checked against the policy and the [plugin pre-submission checklist](https://claude.com/docs/plugins/pre-submission-checklist) on 2026-10-14.

Submit from the owner's personal paid account, never from a work organization: the first organization to submit a repository folder owns the listing.

## Repository fields

| Field | Value |
|---|---|
| Repository | `https://github.com/nuromirzak/nibbl` |
| Branch or tag | `main` |
| Plugin folder | `plugin` |
| Name | `nibbl` (from `plugin/.claude-plugin/plugin.json`) |
| License | MIT (`license` in `plugin.json`, `LICENSE` at the repo root) |
| Privacy policy | `https://getnibbl.pages.dev/privacy/` |
| Support | `https://github.com/nuromirzak/nibbl/issues` |
| Security contact | `https://github.com/nuromirzak/nibbl/security/advisories/new` |
| How new versions arrive | GitHub push webhook (default) |

Before submitting: `claude plugin validate plugin`, then **Validate** in the portal and fix anything marked **Blocking**.

## Data handling answers

**Does the plugin read or store personal data?**
Pseudonymous data only. The server stores a SHA-256 hash of the machine id (plus a fixed salt), a hash of the pet's token, hourly counts of event types, and an optional name and label the user types. No email, account, real name, code, prompts or conversation content. The plugin reads the machine id locally (`ioreg` on macOS, `reg query` on Windows, `/etc/machine-id` on Linux) only to compute that hash.

**Does it send data to services other than its declared connectors?**
Yes, to one service the developer owns: `https://getnibbl.pages.dev/api` (a Cloudflare Worker with D1, same Cloudflare account as the site). It sends event types with times (turn, check passed, commit, error, pet, hide), the pet serial and token, the plugin version, the user-set name and label, and the serial of a pet the user waves at. Nothing else, and never code, prompts, file names, commands or command output.

**How long is data kept?**
Pet record, token hash and hourly counts: while the pet exists, deleted on request. Waves: deleted after delivery (end of that UTC day) or after 30 days at most. Daily-salted IP hashes for the hatch limit: deleted after 2 days. Cloudflare Worker logs: a few days, errors only carry messages without user data.

**Is it intended for people under 18?**
No. It is a developer tool for Claude Code users.

## Policy compliance

| Policy item | How nibbl meets it |
|---|---|
| 1A Usage Policy, supported regions | A pixel pet. Nothing in scope of the Usage Policy's restricted uses. |
| 1B No guardrail evasion | The mod adds no tools and no instructions for Claude; it only draws a band, shows toasts and answers `/nibbl`. |
| 1C, 1D Privacy, data minimisation | Only event types and times leave the machine. Command text is matched locally against a short list and dropped. See [privacy](https://getnibbl.pages.dev/privacy/). |
| 1E Intellectual property | Original code and art (MIT). Palette: Sweetie 16 by GrafxKid, credited in `docs/how-it-works.md`. |
| 1F No access to memory, history, files | The mod never reads Claude's memory, chat history or user files. It reads only the machine id for the hash. |
| 2 Instructional software | Not applicable: no MCP server, skills or tool descriptions. |
| 3A Privacy policy | `https://getnibbl.pages.dev/privacy/`: collection, use, retention, deletion, contact. Linked from the README, the plugin README and the site. |
| 3B Contact and support | GitHub issues and private security advisories (`SECURITY.md`). |
| 3C Documentation | `plugin/README.md` (install, commands, troubleshooting, what leaves the machine), `docs/how-it-works.md`. |
| 3D Test account | Not applicable: no account or login. Installing the plugin creates the test state; an egg hatches after 10 answered turns. |
| 3E Three examples | See below. |
| 3F Own the endpoints | `getnibbl.pages.dev` and the `nibbl` Worker are in the developer's Cloudflare account. No other endpoints. |
| 3G Maintenance | Active repo with CI, Dependabot alerts and grouped updates. |
| 4 Unsupported uses | No payments, no AI image generation, no ads. |
| 5 MCP requirements | Not applicable: no MCP server. |

## Three examples of core functionality

1. Run a failing test in Claude Code (for example ask Claude to run `pnpm test` on a broken test). A bug drops into the pet's scene above the prompt. Fix it and run the tests again: the pet eats the bug and pops a heart.
2. Type `/nibbl`. It shows the pet's serial, tier, level and XP, hearts left this hour, its rarest trait, its rank and the nibbl just above, and the link to its public card.
3. Type `/nibbl wave 1`. The pet sends a heart to nibbl #000001; that pet's owner sees "<name> waved at <their pet> ♥" on their next sync. `/nibbl pet` pets your own nibbl from the prompt.

## Handling a deletion request

The [privacy page](https://getnibbl.pages.dev/privacy/) asks the owner to set the label `delete me` (only the owner's plugin can) and open an issue titled `Delete #<serial>`.

1. Check the label: `curl -s https://getnibbl.pages.dev/api/rank/<serial>` shows `"label":"delete me"`.
2. Hide it right away and delete within 7 days:

```sh
pnpm -C apps/api exec wrangler d1 execute nibbl --remote --command "UPDATE pets SET is_hidden = 1 WHERE serial = <serial> AND label = 'delete me'"
pnpm -C apps/api exec wrangler d1 execute nibbl --remote --command "DELETE FROM waves WHERE from_serial = <serial> OR to_serial = <serial>; DELETE FROM xp_windows WHERE serial = <serial>; DELETE FROM pet_totals WHERE serial = <serial>; DELETE FROM pet_achievements WHERE serial = <serial>; DELETE FROM invite_notices WHERE from_serial = <serial> OR to_serial = <serial>; DELETE FROM week_snap WHERE serial = <serial>; DELETE FROM week_winners WHERE serial = <serial>; UPDATE pets SET invited_by = NULL WHERE invited_by = <serial>; DELETE FROM pets WHERE serial = <serial> AND label = 'delete me'"
```

The statements cover every table keyed by the serial: waves and invite notices in both directions, hourly counts, lifetime totals, achievements, the week snapshot and week wins. Other pets that were invited by this one keep existing, so their `invited_by` is cleared before the pet row goes. Run all of them in one command, the pet row last.

3. Close the issue with a one-line confirmation. The serial is never reused.
