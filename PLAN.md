# OpenClaw Admin — Current Project Status

> Updated: 2026-06-23

This file tracks the current operational state of the OpenClaw ERP Chatbot Admin solution. It replaces the older sprint plan that referenced the pre-2026.6 runtime and systemd gateway setup.

---

## Runtime And Deployment Baseline

| Component | Current Baseline | Notes |
| --- | --- | --- |
| OpenClaw runtime | `2026.6.8` + ERP runtime artifact | Gateway should run `/root/openclaw-runtime-2026.6.8-erp/dist/index.js` |
| openclaw-gateway | `pm2` on host, port `18789` | Uses `/root/start-openclaw-gateway.sh` |
| openclaw-api | `pm2` on host, port `4000` | Must use `OPENCLAW_BIN` pointing to the same ERP runtime artifact |
| openclaw-admin | Docker, port `3000` | Next.js Admin UI |
| PostgreSQL | Docker, port `5432` | Admin users, webchat, audit, conversation analysis, business profiles, learning queue |

Required openclaw-api feature flags:

```bash
CONVERSATION_ANALYSIS_ENABLED=1
MEMORY_LEARNING_REVIEW_ENABLED=1
MONITOR_MEDIA_PREVIEW_ENABLED=1
```

---

## Completed Capabilities

- Operations dashboard and `/system` self-service remediation are current.
- `/model` supports provider keys, runtime-verified text tests, optional image understanding tests, and safe save/restart guidance.
- `/monitor` supports live debug, model trace metadata, and secure media preview when runtime logs include safe media refs.
- `/analysis/conversations` supports historical triage, issue tags, media metadata/preview, Export for Codex, and sending selected turns to Learning Review.
- `/business-profiles` supports bounded business context templates, editable profiles, agent links, and SOUL template injection through admin-controlled Load Template.
- `/memory` supports Memory Learning: `MEMORY.md` truth, daily memory notes, `DREAMS.md` review diary, learning candidates, approve/reject/apply, backups, and rollback.

---

## Current Rollout State

- Dev server `192.168.2.109` is current and is the reference environment.
- Customer server `chang168.thddns.net` has been updated through openclaw-api + openclaw-admin and uses the ERP runtime artifact under pm2.
- Conversation Analysis was cleared after Business Profile rollout so new data can represent customer behavior after the latest prompt/context changes.
- Current mode: wait for customer conversation data, export/analyze, and tune only the correct layer.

---

## Operating Loop For Customer Feedback

1. Let customer users chat normally in Telegram.
2. Open `/analysis/conversations` and filter by date, agent, channel, issue tag, keyword, or media.
3. Use turn detail to inspect user question, final answer, tool/model evidence, latency, media metadata, and raw timeline.
4. Export with **Export for Codex** when a larger review pack is needed.
5. Send specific turns to **Admin Review** only when they contain reusable evidence.
6. Review candidates in `/memory?tab=learning`.
7. Apply the right target layer:
   - `Business Profile`: stable business context or wording pattern.
   - `SOUL`: response rules, safety, tool-contract behavior.
   - `MCP/Search`: synonyms, normalization, search behavior.
   - `Model/Runtime`: timeout, fallback, provider/model issue.
   - `MEMORY.md`: admin-approved fact or preference specific to the agent/store.
8. Restart gateway or reset active sessions when the applied change needs runtime reload.
9. Compare the next export against the previous baseline.

---

## Guardrails

- Do not train model weights from customer chat.
- Do not auto-write memory from chat users.
- Do not hardcode customer-specific product names or keywords in application logic.
- Do not put long synonym dictionaries into SOUL; put them in MCP/Search data or profile details.
- `Business Profile` is bounded prompt context, not business master data.
- `MEMORY.md` is truth only after admin approval, with backup and rollback.
- Price, stock, substitute products, and product identity must come from MCP/tool evidence, not model guesses.
- Export for Codex must stay redacted and must not include actual image files.

---

## Customer Update Commands

### openclaw-api

```bash
cd /root/openclaw-api
git pull --ff-only origin main
npm ci --omit=dev

grep -q '^CONVERSATION_ANALYSIS_ENABLED=' .env \
  && sed -i 's/^CONVERSATION_ANALYSIS_ENABLED=.*/CONVERSATION_ANALYSIS_ENABLED=1/' .env \
  || echo 'CONVERSATION_ANALYSIS_ENABLED=1' >> .env

grep -q '^MEMORY_LEARNING_REVIEW_ENABLED=' .env \
  && sed -i 's/^MEMORY_LEARNING_REVIEW_ENABLED=.*/MEMORY_LEARNING_REVIEW_ENABLED=1/' .env \
  || echo 'MEMORY_LEARNING_REVIEW_ENABLED=1' >> .env

grep -q '^MONITOR_MEDIA_PREVIEW_ENABLED=' .env \
  && sed -i 's/^MONITOR_MEDIA_PREVIEW_ENABLED=.*/MONITOR_MEDIA_PREVIEW_ENABLED=1/' .env \
  || echo 'MONITOR_MEDIA_PREVIEW_ENABLED=1' >> .env

pm2 restart openclaw-api --update-env
pm2 save
```

### openclaw-admin

```bash
cd /root/openclaw-admin
git pull --ff-only origin main
docker compose build openclaw-admin
docker compose up -d openclaw-admin
docker compose ps
```

---

## Post-Update Smoke

- Dashboard: health is `OK` or only shows actionable items that are expected.
- System Check: no stale runtime/model warnings after regression is confirmed.
- Model & Keys: selected primary/fallback models pass runtime text test.
- Monitor: Telegram `/reset` + `สวัสดี` appears and replies normally.
- Conversation Analysis: new turns ingest and can be exported.
- Memory: Learning Review opens, candidate creation from Analysis works, and no memory is applied without admin confirmation.

---

## Feedback Watchlist

- Search no-result or low-confidence product lookup.
- Repeated fallback/model timeout.
- Incorrect price/stock answer without tool evidence.
- User sends image but the result is unclear or unsupported.
- SOUL response style that is too long, too stiff, or repeats words.
- MEMORY.md growth beyond the token budget warning.
- Business Profile changes that have not been reloaded into agent SOUL.
