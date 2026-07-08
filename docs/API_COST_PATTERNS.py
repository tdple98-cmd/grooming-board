"""
Claude API cost-optimization patterns — the exact changes I'll apply to your automations.
Python (anthropic SDK). Each block is a "before -> after" you can copy.

Install:  pip install anthropic
Auth:     export ANTHROPIC_API_KEY=sk-...

NOTE ON MODEL IDs: verify current IDs at https://claude.com/pricing or the
models doc before shipping — they change. Placeholders below reflect the
current generation (Sonnet for most work, Haiku to gate, Opus only when needed).
"""

import anthropic

client = anthropic.Anthropic()

# Route each step to the cheapest model that clears the bar.
FAST   = "claude-haiku-4-5"    # classify / extract / route / filter
SMART  = "claude-sonnet-4-5"   # most generation + reasoning  <- your default
EXPERT = "claude-opus-4-8"     # only genuinely hard reasoning


# ─────────────────────────────────────────────────────────────────────────────
# LEVER 1 — PROMPT CACHING  (~90% off any context you reuse across calls)
# Put STATIC content (system prompt, instructions, big reference docs, examples)
# behind a cache_control breakpoint. Put VOLATILE content (the user's input)
# AFTER it, with no breakpoint. First call writes the cache (1.25x); every call
# within 5 min reads it at 0.1x. Break-even ≈ 11 reuses.
# ─────────────────────────────────────────────────────────────────────────────

STATIC_INSTRUCTIONS = "You are a support-triage assistant. Follow these rules..."
BIG_REFERENCE_DOC   = open("knowledge_base.md").read()  # e.g. your policies/catalog

def answer(user_message: str):
    resp = client.messages.create(
        model=SMART,
        max_tokens=1024,
        system=[
            {"type": "text", "text": STATIC_INSTRUCTIONS},
            {
                "type": "text",
                "text": BIG_REFERENCE_DOC,
                "cache_control": {"type": "ephemeral"},  # <-- breakpoint on last static block
            },
        ],
        messages=[{"role": "user", "content": user_message}],  # volatile, after the breakpoint
    )
    # Verify the cache is actually working (do this once while tuning):
    u = resp.usage
    print(f"cache_write={u.cache_creation_input_tokens} "
          f"cache_read={u.cache_read_input_tokens} fresh={u.input_tokens}")
    return resp.content[0].text
    # Goal state: after the first call, cache_read is large and cache_write is ~0.


# ─────────────────────────────────────────────────────────────────────────────
# LEVER 2 — BATCH API  (50% off input AND output, for anything not real-time)
# Bulk generation, enrichment, classification, summarizing a backlog, evals.
# Up to 100k requests/batch; most finish < 1 hour. Stacks with caching (~95% off).
# ─────────────────────────────────────────────────────────────────────────────

from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
from anthropic.types.messages.batch_create_params import Request

def submit_bulk(items: list[str]):
    batch = client.messages.batches.create(
        requests=[
            Request(
                custom_id=f"item-{i}",  # you match results back by this
                params=MessageCreateParamsNonStreaming(
                    model=SMART,
                    max_tokens=512,
                    system=[
                        {"type": "text", "text": STATIC_INSTRUCTIONS},
                        {"type": "text", "text": BIG_REFERENCE_DOC,
                         "cache_control": {"type": "ephemeral"}},  # caching works in batch too
                    ],
                    messages=[{"role": "user", "content": text}],
                ),
            )
            for i, text in enumerate(items)
        ]
    )
    return batch.id

def collect_bulk(batch_id: str):
    batch = client.messages.batches.retrieve(batch_id)
    if batch.processing_status != "ended":
        return None  # poll again later; results kept for 29 days
    out = {}
    for entry in client.messages.batches.results(batch_id):  # may arrive out of order
        if entry.result.type == "succeeded":
            out[entry.custom_id] = entry.result.message.content[0].text
    return out


# ─────────────────────────────────────────────────────────────────────────────
# LEVER 3 — MODEL ROUTING  (cheap model gates the expensive one)
# Often the single highest-ROI change: don't send easy work to a big model.
# ─────────────────────────────────────────────────────────────────────────────

def smart_route(user_message: str):
    # Cheap triage first: is this simple or complex?
    triage = client.messages.create(
        model=FAST,
        max_tokens=5,
        messages=[{"role": "user",
                   "content": f"Reply only SIMPLE or COMPLEX. Query: {user_message}"}],
    )
    tier = triage.content[0].text.strip().upper()
    model = EXPERT if "COMPLEX" in tier else SMART
    return client.messages.create(
        model=model, max_tokens=1024,
        messages=[{"role": "user", "content": user_message}],
    ).content[0].text


# ─────────────────────────────────────────────────────────────────────────────
# LEVER 4 — TRIM OUTPUT & INPUT
#  • Cap max_tokens to what you actually need (output is the priciest tokens).
#  • Ask for terse/structured output ("respond as JSON, no prose").
#  • Pre-filter data before it enters the prompt — send the 20 relevant rows,
#    not the whole 10k-row dump. Every token you don't send is a token you
#    don't pay for, at full input price.
# ─────────────────────────────────────────────────────────────────────────────
