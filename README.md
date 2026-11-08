# AveroAI

**One space. Every intelligence.**

A multi-model AI chat workspace with a Liquid Glass-inspired interface and a server-side provider gateway.

## Included in this first foundation

- Next.js + TypeScript application.
- Responsive chat interface and model picker.
- Streaming responses.
- Local conversation history in the browser.
- Server-side API keys (never exposed to client code).
- Initial adapters for OpenAI, Anthropic, Gemini's OpenAI-compatible endpoint, and OpenRouter.
- Optional custom OpenAI-compatible endpoint.

## Run locally

Requirements: Node.js 20.9+ and an API key for at least one supported provider.

1. Run `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Add at least one provider API key.
4. Run `npm run dev`.
5. Open `http://localhost:3000`.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI |
| `ANTHROPIC_API_KEY` | Anthropic |
| `GOOGLE_API_KEY` | Gemini |
| `OPENROUTER_API_KEY` | OpenRouter |
| `CUSTOM_BASE_URL` + `CUSTOM_API_KEY` | Custom OpenAI-compatible API |

Never commit real API keys. Use `.env.local` locally and your host's encrypted environment-variable settings in production.

## Important

The model list is a starter catalogue, not a guarantee of access. A model responds only when its provider key is configured and the provider permits that model for your account. A gateway routes authorized requests; it does not bypass billing, subscriptions, or provider access controls.

## Roadmap

- [ ] Persistent accounts and cloud-synced conversations.
- [ ] Provider management and connection tests.
- [ ] Native Gemini adapter and more provider integrations.
- [ ] Usage, limits, retries, and normalized errors.
- [ ] Attachments, tools, web search, and preferences.
- [ ] Automated tests and deployment workflow.

## License

All rights reserved. No license has been granted yet.
