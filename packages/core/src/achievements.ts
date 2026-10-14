export type Totals = {
  turns: number
  checks: number
  commits: number
  errors: number
  pets: number
  wavesSent: number
  activeDays: number
}

export type AchievementFacts = Totals & { level: number; friends: boolean; weekWins: number }

export type Achievement = {
  id: string
  name: string
  desc: string
  goal: number
  metric: (f: AchievementFacts) => number
}

export const ZERO_TOTALS: Totals = {
  turns: 0,
  checks: 0,
  commits: 0,
  errors: 0,
  pets: 0,
  wavesSent: 0,
  activeDays: 0,
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first-bite', name: 'First Bite', desc: 'Pass 1 check', goal: 1, metric: (f) => f.checks },
  { id: 'bug-hunter', name: 'Bug Hunter', desc: 'Pass 100 checks', goal: 100, metric: (f) => f.checks },
  { id: 'exterminator', name: 'Exterminator', desc: 'Pass 1000 checks', goal: 1000, metric: (f) => f.checks },
  { id: 'committed', name: 'Committed', desc: 'Make 100 commits', goal: 100, metric: (f) => f.commits },
  { id: 'shipper', name: 'Shipper', desc: 'Make 1000 commits', goal: 1000, metric: (f) => f.commits },
  { id: 'pair', name: 'Pair Programmer', desc: 'Get 1000 answered turns', goal: 1000, metric: (f) => f.turns },
  { id: 'marathon', name: 'Marathon', desc: 'Get 10000 answered turns', goal: 10000, metric: (f) => f.turns },
  { id: 'stubborn', name: 'Never Gives Up', desc: 'Survive 100 failed tool runs', goal: 100, metric: (f) => f.errors },
  { id: 'regular', name: 'Regular', desc: 'Be active on 7 days', goal: 7, metric: (f) => f.activeDays },
  { id: 'devoted', name: 'Devoted', desc: 'Be active on 30 days', goal: 30, metric: (f) => f.activeDays },
  { id: 'teen', name: 'Growing Up', desc: 'Reach teen stage (level 10)', goal: 10, metric: (f) => f.level },
  { id: 'adult', name: 'All Grown Up', desc: 'Reach adult stage (level 25)', goal: 25, metric: (f) => f.level },
  { id: 'friends', name: 'Friends', desc: 'Invite someone or be invited', goal: 1, metric: (f) => (f.friends ? 1 : 0) },
  { id: 'social', name: 'Social Butterfly', desc: 'Send 25 waves', goal: 25, metric: (f) => f.wavesSent },
  { id: 'week', name: 'Nibbl of the Week', desc: 'Win a week', goal: 1, metric: (f) => f.weekWins },
]

export const achievementById = (id: string): Achievement | undefined =>
  ACHIEVEMENTS.find((a) => a.id === id)

export const unlockedIds = (f: AchievementFacts): string[] =>
  ACHIEVEMENTS.filter((a) => a.metric(f) >= a.goal).map((a) => a.id)

export const nextUp = (
  f: AchievementFacts,
  have: ReadonlySet<string>,
  n = 3,
): { id: string; name: string; value: number; goal: number }[] =>
  ACHIEVEMENTS.filter((a) => !have.has(a.id))
    .map((a, i) => ({ id: a.id, name: a.name, value: Math.min(a.metric(f), a.goal), goal: a.goal, i }))
    .sort((x, y) => y.value / y.goal - x.value / x.goal || x.i - y.i)
    .slice(0, n)
    .map(({ i: _i, ...rest }) => rest)
