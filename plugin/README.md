# Nibbl

A tiny pixel pet that lives above your Claude Code prompt. It hatches from an egg after 10 answered turns, reacts to what really happens in your session (a bug appears on an error, it eats the bugs when your tests pass, it carries a box when you commit, it goes on an expedition while Claude works and sleeps when you are away) and grows over months. It never costs a model token and never interrupts you.

## Install

    /plugin marketplace add https://getnibbl.pages.dev/marketplace.json
    /plugin install nibbl@nibbl

To get updates automatically: `/plugin`, **Marketplaces**, **nibbl**, **Enable auto-update** (Claude Code leaves it off for community marketplaces).

## Commands

| Command | What it does |
|---|---|
| `/nibbl` | Name, serial, tier, level, XP, hearts, rarest trait, card and leaderboard links, your rank with the nibbl just above you, the last note and wave, and an update hint when a newer version is out |
| `/nibbl pet` | Pets it from the prompt |
| `/nibbl name <text>` | Rename your pet (once a week, up to 16 characters) |
| `/nibbl label <text>` | Set a label (up to 24 characters); `/nibbl label` alone clears it |
| `/nibbl wave <serial>` | Sends a wave (a heart, no text, no XP) to another nibbl: `16`, `#16` and `000016` all work. 10 a day, one per nibbl per day |
| `/nibbl share` | Prints your card link, a ready post ("Meet Pixel, my nibbl #000019, a rare teen...") and a link that opens it in X. Nothing is sent anywhere |
| `/nibbl badge` | Prints the markdown for a badge of your nibbl to paste into your GitHub profile README (the repo named after your username). Nothing is sent anywhere |
| `/nibbl egg [code]` | On a hatched pet: your two gift eggs (one at level 10, one at level 25) as one-time codes to give to friends. On an egg: `/nibbl egg ABCDE-FGHJK` saves a friend's code, and your pet hatches as the child of that nibbl and inherits its mark when it can |
| `/nibbl achievements` | Your unlocked achievements with their dates (UTC) and the next three with progress, for example `Bug Hunter 63/100`. Asks the server, so it needs a connection |
| `/nibbl invite [code or serial]` | An alias of `/nibbl egg`. A plain serial keeps the old behaviour: on an egg, `/nibbl invite 19` saves who invited you, and your pet becomes friends with #000019 when it hatches |
| `/nibbl notes` | Lists the notes from the maker you have received |
| `/nibbl odds` | Hatch odds and the odds of each of your pet's traits |
| `/nibbl export` | Shows the secret code that moves your pet to another machine |
| `/nibbl import <code>` | Moves a pet to this machine |
| `/nibbl hide` | Hides or shows the band; the pet keeps living |

Every couple of days a short note from the maker shows as a toast (20 notes in total, bundled in the mod, so they work offline). Waves you receive from a 0.4.0 pet show as a visit (below); older ones show as one toast per sync, and `/nibbl` shows `rank 4 of 26 · next: #000019 ...` so you know whom to wave at. There is no free-text chat. A toast also appears when you first reach the top 10, when you reach #1, and once per new version.

### Visits, coding today and gift eggs (0.4.0)

- **Visits.** When someone waves at your nibbl, their pet walks into your scene on your next answered turn, stands next to yours for about 90 seconds and the band says "Ziutek came to say hi". Your pet steps aside. Up to 5 visits wait their turn. It is a scene change, not a toast, and it gives nothing to either side.
- **Coding today.** `/nibbl` shows how many nibbls synced in the last 24 hours ("12 nibbls coding today"), and while your pet is idle the band alternates the time-of-day line with it every 15 seconds. It is a count only, never who.
- **Badge.** `/nibbl badge` prints the markdown for your GitHub profile README.
- **Gift eggs.** Your nibbl lays an egg for a friend at level 10 and another at level 25, two for life. `/nibbl egg` shows the codes. A friend who types one before their egg hatches gets a pet that is your nibbl's child and inherits its mark when it can (best effort, no XP, no better odds). You get a toast when it hatches.

### Daily greeting, evolution, achievements, invites and the week

- **Greeting.** The first answered turn of your local day shows a short greeting (32 lines, by time of day, bundled in the mod). Not on the day your egg hatches.
- **Time of day.** When nothing else is going on, the band shows what your pet is up to: sipping coffee in the morning, sunbathing in the afternoon, reading the logs in the evening.
- **Evolution.** At level 10 your pet becomes a teen and at level 25 an adult, with a toast and a new look; `/nibbl` shows `stage: teen (since level 10)`.
- **Achievements.** 15 of them, for example Bug Hunter (100 passed checks). A toast shows when you unlock one; `/nibbl achievements` lists them. They are public on your pet's card.
- **Invites.** Type `/nibbl invite <serial>` before your egg hatches and both pets get the Friends achievement.
- **Nibbl of the Week.** The pet that gains the most XP in a week is featured at https://getnibbl.pages.dev/week and gets a toast.
- **One toast at a time.** News waits in a small local queue and shows one toast per answered turn, the most important first (week win, achievement, invite, wave, greeting, maker note, update). Level-ups and the hatch show at once.

Type `/nibbl pet`, or focus the band with `ctrl+x tab` and press `p` (a click on `[♥]` works in the fullscreen terminal). Five pets an hour give XP; after that it still loves you, it just gives no XP.

## Odds

Every egg is rolled on the server, once per machine, with the same odds for everyone: common 40%, uncommon 30%, rare 18%, epic 9%, legendary 3%. Shiny is 4% on top of any tier (a legendary shiny is about 1 in 830). Every pet also rolls a mark with odds of 1 in 24 (4.17%), so each one has a trait rarer than 5%. `/nibbl odds` shows yours.

## What leaves your machine

- `machineHash`: the SHA-256 of your hardware id plus "nibbl". The id itself never leaves.
- Your pet's serial and token.
- The name and label you set with `/nibbl name` and `/nibbl label`. They show on your pet's public card and the leaderboard.
- The serial you wave at with `/nibbl wave <serial>`, so the server can deliver the wave. No text goes with it.
- A gift egg code, if you enter one with `/nibbl egg <code>` before your egg hatches: sent once, with the hatch, and then forgotten. It replaces the inviter's serial, which only the old `/nibbl invite <serial>` still sends.
- Your gift eggs are listed by asking the server with your serial and token; the visits you get arrive with the sync answer. No new data is collected about you.
- Events: only the type (`turn`, `check_pass`, `commit`, `error`, `pet`, `hide`) and the time of each. Never your prompts, commands, file paths or outputs.

All of it goes to https://getnibbl.pages.dev and nowhere else. The export code is a secret: anyone who has it owns your pet, so it is drawn on your screen only and never sent to the model.

Full privacy policy, retention and how to delete your pet: https://getnibbl.pages.dev/privacy/

## Troubleshooting

- **No band above the prompt.** Nibbl needs a Claude Code version with mods (function hooks). Update Claude Code, then restart it. In a short terminal the band shrinks to one line; `/nibbl` always works.
- **Clicking `[♥]` or pressing `p` does nothing.** The band takes keys only when it has focus: press `ctrl+x tab` first, or use `/nibbl pet`.
- **Still an egg.** It hatches after 10 answered turns. `/nibbl` shows how many are left.
- **"Could not reach the nibbl server".** You are offline or the server is busy. Events wait in a local queue and sync later; nothing is lost.
- **New version not showing.** Community marketplaces do not auto-update: run `/plugin marketplace update nibbl`, then `/plugin update nibbl@nibbl`, and restart. Or turn on auto-update in `/plugin`, Marketplaces, nibbl.
- **Anything else.** Open an issue: https://github.com/nuromirzak/nibbl/issues

## Local testing

Run the API with `pnpm -C apps/api dev` and point the mod at it with `NIBBL_API=http://localhost:8787` (or the `Nibbl server` option in `/config`).
