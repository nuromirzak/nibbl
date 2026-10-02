# Nibbl product principles

Date: 2026-10-02. Status: agreed with the owner. Companion to `docs/superpowers/specs/2026-10-02-nibbl-design.md`; every feature in the spec is checked against this page.

## Mission

Make waiting for Claude feel warm.

## What we give

- A companion that lives next to your work.
- An honest mirror of the session: it reacts only to what really happened.
- A small pride: a pet that is one of a kind.
- A reason to smile between turns.

## What the user should feel

| We want | We never allow |
|---|---|
| "It is alive and it is **mine**" (attachment) | Guilt ("I abandoned it") |
| "Someone noticed": it is happy when tests go green | Irritation: it gets in the way of work |
| Calm: you can leave for a week | Feeling watched: what is it sending about me? |
| Pride: I want to show the card | FOMO and streak pressure |
| Curiosity: what happens at the next level? | "I got a crappy one" |

## Philosophy: quiet, honest, yours

1. **Honest.** Reacts only to real events. No emotions on a timer. Displayed odds are the real odds.
2. **Quiet.** Never blocks work, never nags, never guilt-trips. A nibbl never dies.
3. **Yours.** Unique genome and serial. No two nibbls look alike.
4. **Earned.** Luck sets the starting genes. Effort sets the form.
5. **Tiny.** 32×16 scene, zero model tokens, works offline.

## Success metrics

Thresholds are the owner's targets, not industry benchmarks.

| Kind | Metric | Target |
|---|---|---|
| **North star** | Weekly Active Nibbls: pets that synced on ≥3 distinct days in the week | grows week over week |
| Activation | Installs that hatch within 24 h | ≥ 70% |
| Retention | D7 / D30 by sync | ≥ 40% / ≥ 25% |
| Attachment | Pets with a user-set name (the most honest love signal) | ≥ 50% |
| Virality | Visits to `/p/:serial` and click-through to the landing; GitHub stars | growing |
| Guardrail | Users with `/nibbl hide` on | < 10% |
| **Anti-churn guardrail** | D7 gap between common and rare+ pets | ≤ 5 pp |
| Guardrail | Model tokens spent | always 0 |

Measurement needs: the sync payload carries a `hide` event (add in the mod plan). Everything else comes from data the server already has (sync days, hatch time, name set, tier).

## Mechanics: what we take from Tamagotchi

- **Real-time presence.** The pet is there while you work.
- **Care shapes the form.** Evolution branches follow your working style, plus a secret form (as Bill/Oyajitchi was).
- **Minimal controls.** One click or hotkey instead of three buttons.
- **Poop becomes bugs.** An error brings a bug onto the scene; green tests clear it.
- **Sleep at night.** After 02:00: nightcap and yawns.
- **The tiny screen is the charm.** 32×16 pixels.

## Tamagotchi mistakes we do not repeat

| Tamagotchi mistake | Our rule |
|---|---|
| Dies from neglect | Never dies. The worst state is "bored" or "asleep", and working fixes it |
| Beeps in class, demands attention | Never interrupts. A toast only on hatch and level-up |
| Time runs without you, no pause | Time stops without you. Nothing decays |
| Boring after two weeks, no long-term goal | Levels up to 50, branches, rare events, milestone eggs (v1.1) |
| Nothing to share except showing the keychain | The `/p/:serial` card page |

## Mistakes from other games we do not repeat

| Source | Mistake | Our rule |
|---|---|---|
| Duolingo | Guilt over a lost streak | No streaks at all |
| Gacha, loot boxes | Paid rerolls | We sell nothing; odds are public |
| Cookie Clicker | Click farming | XP cap: 5 hearts per hour |
| FarmVille | Spamming friends | Sharing is opt-in only |
| Idle games | Only numbers change | Every stage looks different |
| Clippy | Butts in uninvited | Reacts, never talks |

## Five mechanics rules

1. Every reaction is tied to a real event.
2. Progress is always visible: level, hearts, stage.
3. At most one rare surprise per day.
4. Zero interruptions.
5. The pet's needs never turn into punishment.
