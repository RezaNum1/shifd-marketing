# Telegram Conversational Ideation Interface

This is an M2 extension that provides a text-only, human-confirmed ideation access channel for a linked Shifd Marketing founder. It does not publish, create Content, run Current Topic Discovery, browse, generate images, or create campaigns.

## Setup

1. Create a Telegram bot with BotFather and obtain its token and username.
2. Add server-only values to `backend/.env`:

   ```text
   TELEGRAM_BOT_TOKEN=
   TELEGRAM_BOT_USERNAME=
   TELEGRAM_WEBHOOK_SECRET=
   TELEGRAM_PUBLIC_WEBHOOK_URL=https://your-host.example/api/integrations/telegram/webhook
   ```

3. Run the forward database migration: `npm run db:deploy` from `backend`.
4. Run the canonical AI seed: `npm run ai:seed`.
5. Deploy the backend behind HTTPS.
6. Set the webhook with `npm run telegram:webhook -- set`.
7. Verify it with `npm run telegram:webhook -- info`; the configured URL, secret, `message` and `callback_query` updates, and `max_connections: 1` should be present.
8. Login to Shifd Marketing.
9. Open Settings → Integrations → Connect Telegram.
10. Open the generated Telegram deep link and complete `/start`.
11. Test `/context`, then begin text ideation.

Webhook administration commands are `set`, `info`, and `delete`. The bot token is read from the server environment and is never printed.

## Supported interaction

`/help`, `/context`, `/product`, `/company`, `/new`, `/save`, and `/cancel` are deterministic. Ordinary private-chat text uses the M2 operations `telegram.ideation.chat` and `telegram.ideation.structure`. Groups, supergroups, channels, attachments, audio, and documents are not supported.

`/save` or “Save this idea” creates only a pending structured preview. The canonical Idea is created only after the founder taps “Save Idea”. Duplicate Telegram updates and duplicate confirmation callbacks are idempotent. The saved Idea keeps Company/Product/Pillar association plus `sourceType=telegram_ideation`, thread reference, and conversation summary; no Content is created.

## Manual UAT

### A. Link

1. Login to Shifd Marketing.
2. Open Settings → Integrations.
3. Select Connect Telegram.
4. Open the generated Telegram link.
5. Complete `/start`.
6. Confirm `/context` displays `Shifd Labs` and the active Product where applicable.

### B. Ideation

Send:

> I want to make content about companies that still wait for physical signatures for routine internal letters, but I don't want it to sound like a hard product promotion.

The assistant should help refine audience, business problem, angle, and pillar over several concise turns.

### C. Save

Send `Save this idea`. No Idea should exist yet. The bot should return Title, Target Audience, Content Angle, Content Pillar, Summary, and Save Idea / Cancel buttons.

### D. Confirm

Tap Save Idea. Exactly one canonical Idea should appear in Shifd Marketing with Company `Shifd Labs`, the active Product, the selected canonical pillar, Telegram provenance, and a conversation summary. No Content should exist.

### E. Idempotency

Tap Save again or replay the callback. The bot should report that the Idea has already been saved, with no duplicate Idea.

### F. Downstream

Open the saved Idea in Shifd Marketing and continue the existing workflow manually: Brief → Generate → Adapt → Creative → Review → Calendar.

## Thesis boundary

Document and evaluate this feature as “Telegram Conversational Ideation Interface” or “Telegram-based conversational access to M2 ideation support”. It is not an autonomous marketing agent or Telegram marketing automation. The founder starts ideation, chooses context, requests and confirms saving, and remains responsible for downstream generation, review, scheduling, and publishing.
