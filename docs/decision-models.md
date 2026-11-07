# Decision models as opponents (Jev, OpenAI Decisions API)

Status (2026-10-03): explored and benchmarked, **nothing in the app, and
the benchmark says not to add it as an opponent**: Jev plays about at
Furbo's level in Scopa and below it in Briscola (results below). It is
fast, cheap and reliable; it is not strong.

## What they are

A decision model writes no text. It gets a state and a question with a
fixed set of answers and returns one of them, with a probability for each.

- **Jev** (TypeSafe AI, launched 2026-09-15). Question types: `choice`
  (one of up to 255 options), `score` (a rubric of 2 to 10 levels), `noul`
  (a yes/no probability). Text input only. $0.042 per million input
  tokens, output free. Answers in roughly 0.2 to 0.7 s.
- **OpenAI Decisions API** (announced at DevDay 2026-09-29, public beta
  since 2026-10-06): GPT-6 Luna held to predefined answers, "10x faster
  than the Responses API", text and images (inline only). Question types
  `predicate` (a probability), `choice` (one of the supplied values, with
  a probability per value and a confidence) and `score` (ordered levels).
  `POST https://api.openai.com/v1/decisions` with `{model, input,
  questions: [{type: 'choice', name, instructions, choices: [{value,
  description}]}]}`, the answers in `answers[]`. $0.10 per million input
  tokens, nothing for output. `gpt-6-luna` is the only model so far.

Choosing one of the legal moves the engine computed is exactly a `choice`
question, so a turn is one request.

## How Jev can be reached from the app

| Route | Endpoint | From a browser |
|---|---|---|
| OpenRouter (alpha) | `POST https://openrouter.ai/api/alpha/decisions`, model `typesafe/jev-1.13` (alias `~typesafe/jev-latest`) | Yes: the preflight answers `access-control-allow-origin: *` for `https://playscopa.net` and `capacitor://localhost` |
| TypeSafe directly | `POST https://api.typesafe.ai/v1/systemone`, model `jev-latest` | No: "Disallowed CORS origin" |

So the route for a static site with the player's own key is OpenRouter,
with the key the app already manages. Jev is not in OpenRouter's
`/api/v1/models` list (only `typesafe/jev-router`, a chat router), so a
model picker needs its own entry for it.

Request and answer (OpenRouter):

```json
{ "model": "typesafe/jev-1.13",
  "state": "…rules and position, a string or JSON…",
  "questions": { "move": { "type": "choice", "instructions": "…",
    "criteria": { "m0": "Play 7 of coins: captures …", "m1": "…" } } } }
```

```json
{ "id": "gen-dec-…", "model": "typesafe/jev-1.13-20260917", "provider": "TypeSafe",
  "answers": { "move": { "type": "choice", "choice": "m0", "confidence": 0.75,
    "probabilities": { "m0": 0.84, "m1": 0.16 } } },
  "usage": { "input_tokens": 476, "output_tokens": 70, "cost": 0.000019992 } }
```

No streaming. Errors: 401 (key), 402 (credit), 429 and 5xx (retry).

Consequences for the app: no reasoning text, so the reasoning view would
show the probability of each move instead; no conversation, so every
request carries the position; the cost is known exactly per answer.

Known weak spots, from TypeSafe's own guidance and early reports:
arithmetic, counting, multi-step reasoning, and state that is not relevant
to the question. Scopa needs sums and card counting, which is why the
benchmark spells out what every move captures (the same idea as the
on-device prompts).

## The benchmark

`scripts/decision-bench.ts` (`npm run bench:decisions`), run with `--help`
for the options.

- The model plays Furbo and Esperto in both games through the real engine
  (`gameReducer` for Scopa, `applyMove` for Briscola).
- Every deal is played twice with the seats swapped, so both sides play
  the same cards once. The margin per round is reported with a standard
  error taken from the per-deal pairs.
- At every decision of the model, Furbo and Esperto are asked what they
  would play there. Agreement with Esperto measures move quality with far
  fewer rounds than win rates need.
- Turns with one legal move are played without a request. A request that
  fails after three retries plays Furbo's move and is counted; eight
  failures in a row, a refused key, or passing `--max-cost` stop the run.
- Two prompt styles: `spelled` (what matters, a round memory, each move's
  outcome, taken from the on-device prompts) and `plain`.
- `--mock` runs the whole harness without requests. `--baselines-only`
  plays the reference pairings below.
- The key comes from `OPENROUTER_API_KEY` or from `local/openrouter.env`
  (git-ignored). `--api openai` plays OpenAI's Decisions API instead
  (`gpt-6-luna`), with `OPENAI_API_KEY` or `local/openai.env`. Results go
  to `local/bench/`.

Default run: 40 deals (80 rounds) per pairing, about 5,000 requests,
$0.12 to $0.15, about four minutes.

### The scale (no model involved)

600 rounds each, same method, 2026-10-03 (`local/bench/reference-pairings.json`):

| Game | Pairing | Rounds won / drawn / lost | Margin per round |
|---|---|---|---|
| Scopa | Esperto vs Furbo | 313 / 71 / 216 | +0.60 ± 0.09 round points |
| Scopa | Scimmietta vs Furbo | 144 / 74 / 382 | −1.49 ± 0.10 round points |
| Briscola | Esperto vs Furbo | 367 / 13 / 220 | +8.9 ± 1.1 card points |
| Briscola | Scimmietta vs Furbo | 84 / 5 / 511 | −38.5 ± 1.4 card points |

With 40 deals the margin is known to about ±0.25 round points in Scopa and
±3 card points in Briscola: enough to place the model between Scimmietta
and Furbo, and to tell Furbo's level from Esperto's in Briscola, less
surely in Scopa.

### Results (2026-10-03, `typesafe/jev-1.13`, 80 rounds per pairing)

Margin per round against Furbo, with the scale from above:

| Player | Scopa (round points) | Briscola (card points) |
|---|---|---|
| Scimmietta (random) | −1.49 ± 0.10 | −38.5 ± 1.4 |
| Jev, `plain` prompt | −0.34 ± 0.25 | −37.2 ± 3.9 |
| Jev, `spelled` prompt | −0.20 ± 0.27 | −14.3 ± 3.1 |
| Furbo | 0 | 0 |
| Esperto | +0.60 ± 0.09 | +8.9 ± 1.1 |

Against Esperto directly (Furbo's own margin there is −0.60 and −8.9):

| Prompt | Scopa: won / drawn / lost, margin | Briscola: won / drawn / lost, margin |
|---|---|---|
| `spelled` | 27 / 4 / 49, −1.16 ± 0.26 | 11 / 1 / 68, −25.6 ± 3.4 |
| `plain` | 20 / 10 / 50, −1.49 ± 0.30 | 10 / 0 / 70, −39.9 ± 3.4 |

Same move as Esperto, at the model's own decisions (Furbo's figure at the
same positions in brackets):

| Prompt | Scopa | Briscola |
|---|---|---|
| `spelled` | 58% (61%) | 54% (63%) |
| `plain` | 55% (57%) | 30% (63%) |

What this says:

- **Scopa:** about Furbo's level, a little below it against Esperto, with
  either prompt. "Capture when you can" carries most of that.
- **Briscola:** with the bare prompt Jev plays like the random bot: it
  does not work out who wins a trick. Told the outcome of every move, it
  follows that advice in four moves out of five and still loses 14 card
  points a round to Furbo.
- It never agreed with Esperto more often than Furbo does. More prompt
  work would mostly mean writing the heuristic into the prompt.
- In Scopa it chose the first listed option more often than Esperto would
  (65% against 46% with `spelled`), a sign of position bias.

The service itself was flawless: 9,935 requests, none failed, none
retried; median 150 ms, 90% under 200 ms, slowest 1.5 s. Cost $0.000031
per move with `spelled` (730 input tokens) and $0.000023 with `plain`,
so about $0.0004 per Scopa round, $0.0006 per Briscola round, and under
a fifth of a cent for a whole game. The two runs and a smoke test cost
$0.27 in total. Raw results: `local/bench/jev-spelled-40deals.json`,
`local/bench/jev-plain-40deals.json`.

### A chat model on the same test (2026-10-03)

`--api chat` lets an ordinary chat model play through OpenRouter's chat
completions with the same key: the app's own single-turn prompt (rules,
the round's history, numbered moves), a strict JSON answer, thinking
switched off the way the app does it (`reasoning: {effort: "none"}` where
the model lists it).

GPT-6 Luna, Scopa only, 80 rounds per pairing, thinking off, at "medium"
(the app's default level and the model's own) and at "high"
(`local/bench/gpt6luna-{nothinking,thinking-medium,thinking-high}-scopa-40deals.json`).
The model lists six levels: none, low, medium, high, xhigh, max.

| Scopa | Margin vs Furbo | Margin vs Esperto | Same move as Esperto | Per move |
|---|---|---|---|---|
| Scimmietta (random) | −1.49 ± 0.10 | | | |
| GPT-6 Luna, no thinking | −0.84 ± 0.28 | −1.61 ± 0.27 | 53% | 1.6 s, $0.00013 |
| Jev, `plain` | −0.34 ± 0.25 | −1.49 ± 0.30 | 55% | 0.15 s, $0.00002 |
| Jev, `spelled` | −0.20 ± 0.27 | −1.16 ± 0.26 | 58% | 0.15 s, $0.00003 |
| GPT-6 Luna, thinking medium | +0.07 ± 0.25 | −0.81 ± 0.28 | 60% | 7.1 s, $0.00039 |
| GPT-6 Luna, thinking high | +0.03 ± 0.20 | −0.78 ± 0.24 | 62% | 8.1 s, $0.00056 |
| Furbo | 0 | −0.60 ± 0.09 | 59 to 61% | |
| Esperto | +0.60 ± 0.09 | 0 | | |

Rounds won / drawn / lost by Luna against Furbo and against Esperto:
without thinking 25 / 7 / 48 and 20 / 4 / 56; at medium 37 / 12 / 31 and
28 / 9 / 43; at high 36 / 14 / 30 and 24 / 11 / 45.

- Without thinking: 914 input and 63 output tokens per move, four of
  1,926 answers named no legal move, $0.25 for the run. No better than Jev
  at Scopa, and probably worse, at ten times the wait and four times the
  price.
- At medium: 915 input and 593 output tokens per move, of which 532
  thinking; no illegal answers; median 7.1 s per move, 90% under 14.5 s,
  the slowest 52 s; $0.76 for the run, about $0.005 per round and two
  cents for a game to 11. Thinking is worth about 0.9 round points per
  round: it lifts Luna from between Scimmietta and Furbo to Furbo's level.
  It still loses to Esperto about as Furbo does.
- At high: 859 thinking tokens per move (60% more), median 8.1 s, 90%
  under 20 s, the slowest 109 s, one illegal answer, $1.07 for the run.
  The play is the same as at medium within the errors: more thinking
  buys nothing here. The limit is the model, so the next step up is a
  bigger model, not xhigh or max.

### More chat models (2026-10-03, Scopa)

Mercury 2.5 (Inception, a diffusion model, $0.04 / $0.15 per million
tokens) on the full test; GPT-6 Sol ($2 / $10) and Gemini 3 Flash Preview
($0.50 / $3, the model behind the free AI) on a quarter-size test, 40
rounds against Esperto only. All with the app's single-turn prompt.

| Scopa | vs Furbo | vs Esperto | Same move as Esperto | Per move |
|---|---|---|---|---|
| Mercury 2.5, thinking "none" | +0.05 ± 0.33 | −0.78 ± 0.26 | 59% | 1.2 s, $0.00008 |
| Mercury 2.5, thinking medium (211 and 216 rounds) | +0.14 ± 0.16 | −0.58 ± 0.17 | 60% | 5.6 s, $0.00038 |
| GPT-6 Sol, no thinking (40 rounds) | | −0.65 ± 0.40 | 59% | 1.6 s, $0.0025 |
| Gemini 3 Flash Preview, thinking high (30 rounds, cut off) | | about −0.1, rough | 63% | 11 s, $0.0099 |

- Mercury 2.5 at "none" still reports about 250 thinking tokens a move.
  Rounds against Furbo 38 / 11 / 31, against Esperto 29 / 6 / 45; 10 of
  1,925 answers illegal; 158 requests retried; $0.16. At medium: 2,300
  thinking tokens a move; three runs together 98 / 27 / 86 against Furbo
  and 70 / 30 / 116 against Esperto, 23 of 5,223 answers illegal, $2.00.
  The first 80 rounds per pairing gave +0.35 and −0.82; with the larger
  sample it is Furbo's level on both counts, so medium buys nothing over
  "none". The two extra runs were cut off at 131 and 136 of 160 rounds
  when the OpenRouter key reached its total spending limit.
- Mercury's requests hang: 7.8% of the attempts at medium (441 of 5,687)
  got no answer within the script's 90 seconds and were sent again; the
  "none" run had 158 such retries too. The quoted speeds are for the
  answers that came. An opponent built on it would need a short timeout
  and a retry of its own.
- GPT-6 Sol without thinking: 13 / 6 / 21 against Esperto, no illegal
  answers, $1.20.
- Gemini 3 Flash Preview at high used about 3,000 thinking tokens a move
  and hit the run's $4 cost limit after 30 of 40 rounds ($4.29). The
  free AI itself asks for the high level (`thinkingLevel: HIGH` in
  `scopa-proxy`, the model's default, formerly `thinkingBudget: -1`) and
  used 450 and 1,500 thinking tokens in two real
  requests, so this run overstates its thinking and its cost. The rounds
  of this run were not saved (the script keeps them now when a run stops
  early).

What the chat models show together:

- Every setting that thinks at all, and the bigger model without
  thinking, lands at Furbo's level: −0.65 to −0.82 a round against
  Esperto (Furbo: −0.60) and Esperto's move in 59 to 63% of positions
  (Furbo: about 60%). They also play Furbo's own move 70 to 86% of the
  time. None came close to beating Esperto; the Gemini run is too short
  and too rough to say more than "about Furbo, perhaps better".
- More thinking did not help once there was some (Luna medium to high,
  Mercury none to medium).
- For Furbo-level play the prices differ by a factor of 120: Mercury 2.5
  at "none" is the cheapest and fastest chat model ($0.00008 and 1.2 s a
  move, under half a cent a game); Jev is cheaper and faster still but
  a little weaker.

Spent on all runs: about $10.00 by the script's count (Jev $0.27, Luna
$2.08, Sol $1.20, Gemini $4.29, Mercury $2.16), which is where the key's
total limit stopped the last two runs. Requests that timed out on our
side are not in that count and may have been billed.

The runs use different random deals, so compare within the error bars.
Not tested: Claude models, GPT-6 Sol or bigger with thinking, Gemini 3.8
Flash, Briscola with a chat model, prompts that hand the model what
Esperto works out (the cards not yet seen).

### OpenAI's Decisions API (2026-10-07, `gpt-6-luna`, 80 rounds per pairing)

The same test as Jev's, `spelled` prompt, through `--api openai` (the
moves as `choices`, the position as `input`). About 6,900 requests in
all, $0.36, none failed. Two of the four runs stopped on a 504 HTML page
from OpenAI's edge two minutes in (the script now retries gateway
errors) and were run again on fresh deals.

Margin per round against Furbo, on the scale above:

| Player | Scopa (round points) | Briscola (card points) |
|---|---|---|
| Scimmietta (random) | −1.49 ± 0.10 | −38.5 ± 1.4 |
| Jev, `spelled` prompt | −0.20 ± 0.27 | −14.3 ± 3.1 |
| GPT-6 Luna, Decisions API | −0.19 ± 0.29 | −17.0 ± 3.7 |
| Furbo | 0 | 0 |
| Esperto | +0.60 ± 0.09 | +8.9 ± 1.1 |

(The cut-off first Briscola run, 74 rounds on other deals, had −8.3 ± 3.7:
the two together make about −12.8 ± 2.6.)

Against Esperto directly (Furbo's own margin there is −0.60 and −8.9):

| Model | Scopa: won / drawn / lost, margin | Briscola: won / drawn / lost, margin |
|---|---|---|
| GPT-6 Luna, Decisions API | 19 / 10 / 51, −1.38 ± 0.28 | 16 / 4 / 60, −20.9 ± 3.1 |
| Jev, `spelled` | 27 / 4 / 49, −1.16 ± 0.26 | 11 / 1 / 68, −25.6 ± 3.4 |

Same move as Esperto at the model's decisions (Furbo at the same
positions in brackets): Scopa 58 to 60% (61%), Briscola 53 to 54% (61 to
63%). Jev had 58% and 54%.

- **Scopa:** Jev's level exactly: around Furbo, below it against Esperto,
  with the same position bias (the first listed move chosen in 64 to 66%
  of the decisions, Esperto's move in 45%).
- **Briscola:** better than Jev, still far below Furbo. It plays Furbo's
  move in 77% of its decisions and loses 13 to 17 card points a round to
  it anyway.
- **Fast and cheap:** median 155 ms, 90% under 340 ms, slowest 5 s. 460 to
  560 input tokens a move, $0.00005 a move, about a tenth of a cent per
  game. Its answers carry no cost figure: the script prices input tokens
  at $0.10 per million.
- Confidence averaged 0.5 to 0.6, and the chosen move was the most
  probable one every time.

**With the whole round's moves in the input** (`--prompt history`: the
`spelled` prompt plus the round's history as the app's single-turn prompt
lists it, "Opponent played 8 of coins and captured: 1 of clubs, 7 of
coins"), Scopa, 80 rounds per pairing, 2026-10-07: vs Furbo 28 / 11 / 41,
−0.41 ± 0.22, vs Esperto 20 / 14 / 46, −0.89 ± 0.21, agreement with
Esperto 57% (Furbo 60%), first listed move 65%. Within noise of the
`spelled` run (−0.19 and −1.38): the history is not used. 697 input
tokens a move instead of 459, median 147 ms, $0.13 for 1,927 requests.

**With the engine's facts about each move** (`--prompt consequences`:
`spelled` plus, for every move, what it takes (cards, coins, the 7 of
coins, sevens and sixes, scopa), what it leaves on the table, and the
opponent's most dangerous answer to that table with the chance that they
hold the card for it, worked out from the cards not seen yet; the state
also counts the unseen sevens, sixes and coins), Scopa, 80 rounds per
pairing, 2026-10-07: vs Furbo 42 / 7 / 31, **+0.25 ± 0.26**, vs Esperto
31 / 8 / 41, **−0.53 ± 0.29**, agreement with Esperto 61% (Furbo 61%),
first listed move 48% (the position bias is gone). That is Furbo's
level, the same as Luna with thinking through chat (+0.07 / −0.81, 60%)
at 143 ms a move instead of 7 s, and still below Esperto. 687 input
tokens a move, $0.13 for 1,925 requests. Eight answers (0.4%) were
refusals (`{type: 'refusal'}`), the first seen: the script retries and
then plays Furbo's move, which happened twice.

| Prompt (Decisions API, Scopa) | vs Furbo | vs Esperto | Same move as Esperto |
|---|---|---|---|
| `spelled` | −0.19 ± 0.29 | −1.38 ± 0.28 | 58–60% |
| `history` | −0.41 ± 0.22 | −0.89 ± 0.21 | 57% |
| `consequences` | +0.25 ± 0.26 | −0.53 ± 0.29 | 61% |
| Furbo itself | 0 | −0.60 ± 0.09 | 61% |

**Larger samples** (280 deals = 560 rounds per pairing, Scopa, 2026-10-07,
27,000 requests, $1.55). The 80-round figures above were rough, and the
`spelled` one against Furbo was lucky:

| Prompt (Decisions API, Scopa) | vs Furbo (won / drawn / lost, margin) | vs Esperto | Same move as Esperto | First listed move |
|---|---|---|---|---|
| `spelled` | 215 / 58 / 287, −0.50 ± 0.12 | 172 / 63 / 325, −1.01 ± 0.10 | 58% | 64% |
| `consequences` | 255 / 72 / 233, **+0.24 ± 0.10** | 209 / 63 / 288, **−0.52 ± 0.09** | 61–62% | 46% |
| Furbo itself | 0 | −0.60 ± 0.09 | 61% | — |
| Esperto itself | +0.60 ± 0.09 | 0 | 100% | — |

- The engine's facts are worth 0.5 to 0.75 round points a round (4 to 5
  standard errors). With them the model sits a little above Furbo and
  well below Esperto. Without them it is between Scimmietta and Furbo.
- **Where the points come from** (per round, model vs opponent). Against
  Furbo with `consequences`: cards 0.51 vs 0.39, coins 0.40 vs 0.38, 7 of
  coins 0.50 vs 0.50, primiera 0.45 vs 0.52, scopas 0.64 vs 0.47: it wins
  on cards and scopas, gives a little back on the primiera. Against
  Esperto it trails in every category (cards 0.38 vs 0.53, primiera 0.41
  vs 0.56, scopas 0.45 vs 0.54). With `spelled` the scopa column is the
  worst (0.48 vs 0.81 against Esperto, 0.58 vs 0.71 against Furbo): being
  told which moves make a scopa and which tables the opponent can clear,
  with the odds, is what the facts fix.
- **The probabilities mean something.** Split by the probability the
  model gave the move it chose, its agreement with Esperto is 36–37%
  under 0.5, 53–54% between 0.5 and 0.75, 71–74% at 0.75 and above, with
  either prompt. A probability bar in a reasoning view would be honest.
- Refusals (`{type: 'refusal'}`): 28 of 13,500 `consequences` requests
  (0.2%), none of 13,500 `spelled` ones, so something in the facts'
  wording ("most dangerous answer", "a scopa for them") trips a filter
  now and then. Retried, 7 moves fell to Furbo's choice.
- 686 input tokens a move with the facts, 459 without; median 155 ms,
  90% under 380 ms with four runs in parallel.

**Briscola with the facts** (`--prompt consequences` there: who takes
the trick and who leads next, trumps spent, who gets the face-up trump
when two cards are left; for a lead, the cards still out that beat it,
the chance that the opponent holds one, the costliest answer and what
the lead wins otherwise; a state line with the unseen cards, the points
still out and the highest trump still out), 200 deals = 400 rounds per
pairing, 2026-10-07, 15,200 requests, $1.20:

| Player (Briscola, card points per round) | vs Furbo | vs Esperto | Same move as Esperto |
|---|---|---|---|
| Scimmietta (random) | −38.5 ± 1.4 | — | — |
| Jev, `spelled` | −14.3 ± 3.1 | −25.6 ± 3.4 | 54% |
| GPT-6 Luna, `spelled` | −12.8 ± 2.6 (two runs pooled) | −20.9 ± 3.1 | 53–54% |
| GPT-6 Luna, `consequences` | 160 / 7 / 233, **−6.9 ± 1.5** | 105 / 7 / 288, **−15.3 ± 1.3** | 56–57% |
| Furbo itself | 0 | −8.9 ± 1.1 | 61–63% |

The facts help here too, by about six card points a round, but they
leave it clearly under Furbo (four standard errors) and far under
Esperto. The lead facts are one trick deep; what Briscola rewards beyond
that, keeping trumps and high cards for the right moment and counting
the deal, is not in them. The probabilities are less telling than in
Scopa: agreement with Esperto 46% under 0.5, 60% between 0.5 and 0.75,
58–62% above. 790 input tokens a move, 4 refusals in 15,200 requests.

Files: `local/bench/openai-decisions-spelled-{scopa,scopa-esperto,briscola,briscola-b}-40deals.json`,
`local/bench/openai-decisions-{history,consequences}-scopa-40deals.json`,
`local/bench/openai-decisions-{spelled,consequences}-scopa-{furbo,esperto}-280deals.json`,
`local/bench/openai-decisions-consequences-briscola-{furbo,esperto}-200deals.json`.

### Conclusion

Not worth adding as an opponent now: the players would get an "AI" that
loses to the free built-in bots. The chat models are in the same place:
with some thinking, or with a bigger model, they reach Furbo's level in
Scopa and stop there. OpenAI's Decisions API (2026-10-07) lands where
Jev did with the same prompt, and the whole round's moves in the input
changed nothing. With the engine's own facts about each move (what it
takes, what it leaves, the opponent's best answer and its odds) it plays
Scopa a little above Furbo (+0.24 ± 0.10) and well below Esperto (−0.52
± 0.09), like Luna with thinking, at a tenth of a second and a tenth of
a cent a game, with probabilities that track move quality; in Briscola
the same kind of facts leave it under Furbo (−6.9 ± 1.5 card points).
Still not above the free bots: a case for adding it would rest on feel
(a fast opponent with move probabilities to show), not on strength.

## If a decision model turns out strong enough later

1. With the player's own key, as a model under OpenRouter: a second
   request path in `src/ai/openrouterProvider.ts`, a picker entry, the two
   OpenRouter bots choosing by decision when that model is selected, and a
   probability list in the reasoning view.
2. As a free opponent through `scopa-proxy`: the price would allow a far
   higher daily allowance than the Gemini one, at the cost of a key on the
   server and a free tier that depends on an alpha endpoint.
