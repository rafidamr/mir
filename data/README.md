# Data

Everything here except `raw/` and `eval/offtopic.json` is made by `npm run data:prepare`. The files are committed so the test run can be repeated on exactly the same data.

## Source and licence

The data comes from the Bitext customer support dataset ("Bitext Sample Customer Support Training Dataset 27K responses v11"): https://huggingface.co/datasets/bitext/Bitext-customer-support-llm-chatbot-training-dataset, © Bitext Innovations. Bitext licenses it under the Community Data License Agreement – Sharing, version 1.0 (CDLA-Sharing-1.0), and the files made from it here are shared under the same licence.

## Files

- `raw/bitext.csv`: the original file, downloaded on the first run. Not committed.
- `kb/kb.jsonl`: the knowledge base. 2,000 customer questions, each with its intent, category and sample reply.
- `kb/embeddings.f32`: one list of numbers per knowledge-base question, in the same order (32-bit floats, little-endian).
- `kb/manifest.json`: what made the files: source checksum, seed, model, sizes and file checksums.
- `eval/practice.jsonl`: 270 practice questions (10 per intent), used to tune settings.
- `eval/test.jsonl`: 30 test questions, used only in the final test run.
- `eval/offtopic.json`: hand-written off-topic messages, not from Bitext, split into practice and test.
- `eval/split-report.md`: counts per intent, plus a check that test questions aren't near-copies of knowledge-base questions.
