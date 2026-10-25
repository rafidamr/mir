1. Gateway is a Node.js backend that has such components:
* APIs:
    * streaming endpoint for chatting with assistant: /v1/assistant
    * tenant data endpoint
* Simple Auth per-tenant API key
* Metering that is logged to PostgreSQL
* Customer assistant is a simple chatbot that does retrieval from knowledge base and forward prompts to LLM router
* LLM router sends prompts to LLM vendors (it's like LiteLLM SDK in Python, but you should find the equivalent in Node.js). The router sends to OpenRouter free tier, then, if it fails, fallback to paid Google Gemini.

2. Console is a simple Next.js web app that calls the Gateway APIs

3. Knowledge base is a slice of 2000 entries of Bitext customer support dataset that cover all intents without duplicates of user messages