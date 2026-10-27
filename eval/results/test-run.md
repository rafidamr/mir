# Test run

Run on 2026-10-27 with knowledge base `kb-b2e9e9d4`. 30 test questions and 6 off-topic test messages, none of them used for tuning. Each model answers on its own, with the gateway's prompt and no fallback. The answers are graded by Claude Opus 5.5 (claude-opus-5-5), highest effort against the support team's reply from Bitext, without being told which model wrote them.

## The two configurations

| Model | Thinking | Recorded price, in / out | List price, in / out |
|---|---|---|---|
| gemini-3.5-flash-lite | low | $0 / $0 | $0.3 / $2.5 |
| openai/gpt-6-luna | none | $0.1 / $0.5 | $0.1 / $0.5 |

Prices are US dollars per million tokens. Gemini is recorded at $0 because it runs on the free tier.

## Intent and refusals (the same for both models)

The lookup picks the intent, and decides whether to refuse, before any model is called. A near-copy is a test question whose closest knowledge-base question has a similarity of 0.95 or more.

| | Near-copies | The rest | All |
|---|---|---|---|
| Test questions | 21 | 9 | 30 |
| Intent right | 21 | 8 | 29 (96.7%) |
| Refused by mistake | 0 | 0 | 0 |

Off-topic messages refused: 6 of 6.

On the 270 practice questions the intent was right 98.1% of the time (see `vote-benchmark-bge-small.md`).

## Results

| | gemini-3.5-flash-lite | openai/gpt-6-luna |
|---|---|---|
| Answered | 30 of 30 | 29 of 30 |
| Failed | 0 | 1 |
| Average grade (1 to 5) | 0 of 30 graded | 0 of 29 graded |
| … on near-copies | – | – |
| … on the rest | – | – |
| Graded 4 or 5 | 0 of 0 | 0 of 0 |
| Made something up | 0 | 0 |
| First words, median / slowest | 6.65 s / 23.96 s | 1.43 s / 2.54 s |
| Whole answer, median / slowest | 6.77 s / 24.43 s | 2.01 s / 4.03 s |
| Tokens per answer, in / out (average) | 498 / 152 | 462 / 67 |
| Cost per answer, as recorded | $0 | $0.000080 |
| Cost per answer, at list price | $0.00053 | $0.000080 |
| Cost per good answer (graded 4 or 5), at list price | – | – |
| Total cost of the answers, at list price | $0.016 | $0.0023 |

Speed and cost cover the answered test questions. Times are measured inside the gateway code, so they leave out the network. Speed also depends on each provider's load at the time of the run, and Gemini runs on Google's free tier.

## Answers graded 3 or lower

None yet.

## For checking by hand

10 graded answers picked at random. For each, note whether you agree with the grade.

