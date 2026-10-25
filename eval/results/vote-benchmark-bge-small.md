# Vote benchmark: bge-small

270 practice questions, 12 off-topic practice messages, knowledge base `kb-b2e9e9d4` (2000 entries). No AI calls.

## How many matches should vote?

Share of practice questions where the vote picks the right intent.

| X (matches voting) | Votes weighed by similarity | One vote each |
|---|---|---|
| 1 | 97.8% | 97.8% |
| 3 | 97.4% | 97.4% |
| 5 | 98.1% | 98.1% |
| 7 | 95.9% | 95.9% |
| 9 | 96.3% | 96.3% |
| 11 | 95.2% | 95.2% |
| 15 | 93.0% | 93.0% |

**Best: X = 5**, right for 265 of 270 (98.1%).

## Near-copies vs the rest (X = 5)

A near-copy is a practice question whose closest knowledge-base question has a similarity of 0.95 or more. Bitext words each question many slightly different ways, so near-copies are common, and they make the vote's job easy.

| Group | Questions | Right |
|---|---|---|
| Near-copies | 168 | 100.0% |
| The rest | 102 | 95.1% |

## Which intents get mixed up? (X = 5)

| Real intent | Right |
|---|---|
| create_account | 8 of 10 |
| check_invoice | 9 of 10 |
| delete_account | 9 of 10 |
| edit_account | 9 of 10 |
| cancel_order | 10 of 10 |
| change_order | 10 of 10 |
| change_shipping_address | 10 of 10 |
| check_cancellation_fee | 10 of 10 |
| check_payment_methods | 10 of 10 |
| check_refund_policy | 10 of 10 |
| complaint | 10 of 10 |
| contact_customer_service | 10 of 10 |
| contact_human_agent | 10 of 10 |
| delivery_options | 10 of 10 |
| delivery_period | 10 of 10 |
| get_invoice | 10 of 10 |
| get_refund | 10 of 10 |
| newsletter_subscription | 10 of 10 |
| payment_issue | 10 of 10 |
| place_order | 10 of 10 |
| recover_password | 10 of 10 |
| registration_problems | 10 of 10 |
| review | 10 of 10 |
| set_up_shipping_address | 10 of 10 |
| switch_account | 10 of 10 |
| track_order | 10 of 10 |
| track_refund | 10 of 10 |

Most common mix-ups:

| Real intent | Voted as | Times |
|---|---|---|
| check_invoice | get_invoice | 1 |
| create_account | switch_account | 1 |
| create_account | recover_password | 1 |
| delete_account | switch_account | 1 |
| edit_account | switch_account | 1 |

## Off-topic cut-off (similarity of the closest match)

Real support questions: lowest 0.767, 1% below 0.802, middle 0.961.
Off-topic messages: lowest 0.491, middle 0.615, highest 0.733.

| Cut-off | Real questions refused | Off-topic messages refused |
|---|---|---|
| 0.30 | 0.0% | 0 of 12 |
| 0.35 | 0.0% | 0 of 12 |
| 0.40 | 0.0% | 0 of 12 |
| 0.45 | 0.0% | 0 of 12 |
| 0.50 | 0.0% | 2 of 12 |
| 0.55 | 0.0% | 2 of 12 |
| 0.60 | 0.0% | 4 of 12 |
| 0.65 | 0.0% | 9 of 12 |
| 0.70 | 0.0% | 11 of 12 |
| 0.75 | 0.0% | 12 of 12 |
| 0.80 | 0.7% | 12 of 12 |
| 0.85 | 4.1% | 12 of 12 |
| 0.90 | 10.0% | 12 of 12 |
| 0.95 | 37.8% | 12 of 12 |

**Suggested: 0.75**, the middle of the gap between the highest off-topic message (0.733) and the lowest real question (0.767). It refuses 0.0% of real questions and 12 of 12 off-topic messages.

## Confidence cut-off (X = 5)

Confidence is how strongly the voters agree. Below the cut-off, the assistant refuses. Counted over the 270 practice questions that pass the off-topic cut-off.

| Cut-off | Answered | Right | Wrong | Right answers lost |
|---|---|---|---|---|
| 0.00 | 270 | 265 | 5 | 0 |
| 0.40 | 269 | 265 | 4 | 0 |
| 0.50 | 266 | 262 | 4 | 3 |
| 0.60 | 260 | 258 | 2 | 7 |
| 0.70 | 243 | 242 | 1 | 23 |
| 0.80 | 242 | 241 | 1 | 24 |
| 0.90 | 214 | 214 | 0 | 51 |
| 1.00 | 214 | 214 | 0 | 51 |

**Suggested: 0.40**. Each right answer counts +1, each wrong answer -2 (a wrong answer is worse than handing over to a person), each refusal 0; this cut-off has the best total.

## Speed (this machine)

Turning one message into numbers: 2.5 ms. Searching 2000 entries: 0.91 ms.
