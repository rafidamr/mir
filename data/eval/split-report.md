# Data split report

Made by `npm run data:prepare` with seed 42. Source: the Bitext customer support dataset (CDLA-Sharing-1.0).

| Step | Questions |
|---|---|
| In the source file | 26872 |
| Duplicates removed | 3046 |
| Knowledge base | 2000 |
| Practice | 270 |
| Test | 30 |
| Not used | 21526 |

## Per intent

| Intent | Knowledge base | Practice | Test |
|---|---|---|---|
| cancel_order | 75 | 10 | 1 |
| change_order | 74 | 10 | 1 |
| change_shipping_address | 74 | 10 | 1 |
| check_cancellation_fee | 74 | 10 | 1 |
| check_invoice | 74 | 10 | 1 |
| check_payment_methods | 74 | 10 | 1 |
| check_refund_policy | 74 | 10 | 1 |
| complaint | 75 | 10 | 2 |
| contact_customer_service | 74 | 10 | 1 |
| contact_human_agent | 74 | 10 | 1 |
| create_account | 74 | 10 | 1 |
| delete_account | 74 | 10 | 1 |
| delivery_options | 74 | 10 | 1 |
| delivery_period | 74 | 10 | 1 |
| edit_account | 74 | 10 | 1 |
| get_invoice | 74 | 10 | 1 |
| get_refund | 74 | 10 | 1 |
| newsletter_subscription | 74 | 10 | 1 |
| payment_issue | 74 | 10 | 2 |
| place_order | 74 | 10 | 1 |
| recover_password | 74 | 10 | 1 |
| registration_problems | 74 | 10 | 1 |
| review | 74 | 10 | 1 |
| set_up_shipping_address | 74 | 10 | 1 |
| switch_account | 74 | 10 | 2 |
| track_order | 74 | 10 | 1 |
| track_refund | 74 | 10 | 1 |

## Are test questions near-copies of knowledge-base questions?

For each test question, the similarity (0 to 1) to its closest knowledge-base question:

- lowest 0.854, middle 0.959, highest 0.997
- 21 of 30 are at or above 0.95 (near-copies)
