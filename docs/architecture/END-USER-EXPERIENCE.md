# Aveiro.ai — End-user installation and remote execution contract

**Status:** product requirement  
**Applies to:** public web application and every end-user workflow

## Non-negotiable end-user experience

Aveiro.ai is a hosted web service. A normal user must be able to:

1. Open the public Aveiro.ai URL in a modern browser.
2. Create or access their account when authentication is introduced.
3. Select an available model from the Aveiro catalogue.
4. Send text and supported attachments and receive streamed responses.
5. Use the service without installing an Aveiro desktop app, CLI, browser extension, local runtime, model weights, GPU driver, Docker, Node.js, Python, or other software.
6. Use the service without supplying personal provider API keys, personal subscriptions, or local machine credentials.

The browser is a client only. It must never download or execute model weights, start inference processes, or act as a GPU worker. User inference is performed by remote infrastructure controlled or authorized by Aveiro.

## Three separate environments

### 1. End user — browser only

- No installation and no terminal commands.
- No local GPU or minimum RAM requirement beyond what the browser itself needs.
- No provider API key entry.
- Conversations and attachments are sent only to Aveiro's hosted backend and then to the selected authorized inference route.
- The UI must clearly show unavailable models instead of silently switching providers or charging users.

### 2. Aveiro web/control-plane hosting

This is the production deployment of the Next.js application and its server-side APIs. It is hosted remotely and owns provider credentials, model policy, user authentication, quotas, routing, monitoring and billing controls. Secrets must remain in the hosting platform's server-side secret store, never in browser bundles or Git.

A developer may run this application locally while developing it. That is a developer workflow only and is not a requirement for Aveiro users.

### 3. Community GPU provider — opt-in operator only

A volunteer or organization that deliberately contributes GPU capacity may install and operate the Aveiro Provider Node on a separate machine they control. This is an operator role, not an end-user requirement.

- The operator explicitly opts in and sees what data their node processes.
- The node runs remotely from the end user's device and connects to an Aveiro-hosted control plane.
- The operator chooses approved models and availability windows.
- The node must be isolated, authenticated, rate-limited and revocable.
- Never ask ordinary users to install a Provider Node or contribute their own GPU merely to chat.
- Never imply that community inference is free to operate: GPU hardware, power, bandwidth and maintenance have real costs.

## Request path

`Browser → Aveiro hosted application/API → policy + account/quota checks → eligible remote inference provider → streamed response → Browser`

For a community-hosted open-weight model:

`Browser → Aveiro gateway → scheduler → signed job → remote Provider Node → its local inference runtime → streamed result`

The inference runtime is local only to the volunteer's provider machine. It is never installed on or run by the end user's computer.

## Product acceptance checks

A release does not satisfy the end-user contract if any of these are true:

- A user must install Node.js, Python, Docker, a desktop app, a browser extension, a model runtime or model weights.
- A user must configure an API key or use a personal paid AI subscription.
- A user's GPU, RAM, disk or uptime is required for remote inference.
- The browser can directly access provider secrets or provider-node credentials.
- The UI labels a node as online merely because its environment variables are configured.
- The app silently falls back to a different model/provider when the selected route is unavailable.

## Current implementation boundary

The current repository has a Next.js web application, server-side provider adapters, and a prototype static connection to one remote Provider Node. It does not yet provide public production hosting, user accounts, persistent cross-device chat sync, dynamic provider registration, multi-node scheduling, or verified real-GPU inference. A configured node is not proof that its GPU or model is online.

The Provider Node currently requires setup by the node operator alongside an OpenAI-compatible inference runtime. That setup must remain strictly an opt-in provider operation and must never leak into the normal end-user onboarding flow.
