# Council Verdict: Ripple `ARCHITECTURE.md` & `LLD.md`

> An LLM Council review of the Ripple design documents. Five advisors (Contrarian,
> First Principles, Expansionist, Outsider, Executor) reviewed the docs independently,
> peer-reviewed each other anonymously, and a chairman synthesized the verdict.

These are genuinely strong documents — clear separation of *what/why* vs *how*, sensible
"minimal infra" instincts, and two real keystone ideas (content-hash short-circuit,
LLM-labels-but-never-scores). The council's job was to pressure-test, so the feedback
below skews critical by design. Take the praise as read.

---

## Where the Council Agrees

- **The hash short-circuit and "LLM labels, deterministic function scores" split are the keepers.**
  Independently praised by the First Principles Thinker, Expansionist, and Contrarian.
  Whatever you cut, keep these two.
- **The scoring story is the weakest part of both docs.** Three advisors hit it from different angles:
  - *Undefined/contradictory:* `SCALE` has no value or derivation, and `ARCHITECTURE.md`
    says `Σ(category_weight × severity × recency_decay)` while `LLD.md` §8.2 computes
    `category_weight × (severity/5) / SCALE`. A new engineer literally cannot implement
    the scorer from this.
  - *Not actually deterministic:* the docs call the score "auditable/deterministic," but
    `severity` comes from a temperature-0.1 LLM. Replay (retry, DLQ, re-score) produces
    different signals → a different score, and `upsertAnalysis` silently overwrites the old one.
  - *Possibly the wrong primitive:* `raw/SCALE*100` measures change *volume*, not threat —
    10 blog posts can outscore a silent pricing teardown.
- **The design is over-built for the stated scale.** 8k fetches/week is ~1 every 75 seconds.
  The Contrarian and First Principles Thinker both flagged the fan-out/fan-in + settle +
  pg-boss + `PROCESS_TYPE` + BlobStore machinery as heavy for a problem a cron loop handles.
- **`recency_decay` and `signals.summary` are ghosts.** `recency_decay` is documented as
  always `1` for the weekly case (so why is it in the formula?), and §5.4's
  `summary = signals.summary` references a field that doesn't exist on `SignalSchema`.

---

## Where the Council Clashes

- **Tear out the queue machinery vs. keep it.** The First Principles Thinker says the
  settle/pg-boss/roles complexity is ~80% accidental at this scale — use a cron + for-loop.
  The Contrarian and Executor implicitly disagree: a naive loop still needs idempotency and
  at-least-once safety, and the *correctness* problems aren't about load.
  **Resolution:** the complexity is justified by reliability/retry semantics, not throughput —
  but the docs sell it on the wrong grounds and under-specify the failure path.
- **Is the score worth keeping at all?** First Principles says demote it to a sort key and
  lead with the specific change ("X dropped enterprise pricing 20%"). The Expansionist says
  the score is fine because the real asset is the underlying signal *dataset*. They actually
  agree the scalar isn't the product — they disagree on whether to keep it.
- **How much to build now.** The Expansionist sees a platform (re-scorable history, sellable
  diff API, benchmarking moat). Four of five peer reviewers pushed back hard: you can't sell
  a "data moat" built on a pipeline that can silently stall and ingests un-validated,
  SSRF-poisonable inputs. **The chairman sides with the skeptics** — the vision is right,
  the sequencing is premature.

---

## Blind Spots the Council Caught

These were missed by *all five* individual advisors and surfaced only in cross-review —
treat them as the highest-value findings:

- **Cold start / week 1.** `getPreviousSnapshot` is undefined for the first snapshot, so
  every source diffs as 100% "added" → max-noise signals and an inflated first score for
  *every* competitor. Nothing in either doc addresses this.
- **No evaluation loop for the LLM labels.** The product's core claim is "we correctly
  categorize competitor moves," yet there's no golden set, no precision/recall, no
  human-in-the-loop, no drift measurement across model versions. You'd have no way to know
  a "73" is correct.
- **Tenant isolation on the new read paths.** §5.2 correctly runs workers in system context,
  but the new `signals`/`analyses` read endpoints need the same `company_id` scoping rigor
  as existing routes — not spelled out.
- **Scraping legality / ToS / PII exposure** of weekly-crawling competitor sites — unaddressed
  in a doc that otherwise has a Security section.
- **Prompt/model versioning.** `analyses.model` records the model, but not the prompt. Change
  either and historical signals stop being comparable — which quietly breaks the Expansionist's
  re-scoring pitch.

---

## The Recommendation

**Keep the architecture's shape, but (1) fix the scoring spec before writing any scorer code,
(2) design the failure path you skipped, and (3) cut scope to a vertical slice.** Concretely:

1. **Reconcile the score now.** Pick one formula, define `SCALE` with a worked example
   (`changes → signals → score = N`), decide if `recency_decay` exists, and stop calling it
   "deterministic" unless you snapshot the LLM's signal output (which you store anyway) and
   score *that* — then re-scoring history becomes legitimately reproducible. This single fix
   also unlocks the Expansionist's best idea (versioned scoring policies).
2. **Design the unhappy path.** The Contrarian's stuck-`pending` deadlock is the most
   dangerous finding: an exhausted `fetch.source` that dead-letters leaves its source row
   `pending` forever, so settle's `pending > 0` check means analyze *never* enqueues and the
   snapshot rots with no alert. Add (a) a reaper for stuck `pending`/`fetching` snapshots, and
   (b) an explicit "mark failed on final attempt" path that doesn't depend on pg-boss reliably
   signaling "last attempt."
3. **Add an SSRF allowlist** before any fetcher ships. Tenant-supplied URLs fetched from the
   worker with no private-IP/metadata-endpoint filtering is a credential-exfil hole, and
   `robots.txt` is described as "optional," not a control.
4. **Demote the scalar, lead with the change.** Store and surface the per-category signals and
   a one-line "what changed"; keep the score as a sort/triage key, not the headline.
5. **Defer:** structured per-source diff parsers (use the line/block fallback for v1),
   Readability-grade normalization, cross-tenant benchmarking, the double-guard settle, and
   testcontainers e2e. Note the docs also omit the **JSONB `sources` → `snapshot_sources` data
   migration**, which the Executor flagged as the riskiest hidden work — spec it.

---

## The One Thing to Do First

Add a **single worked scoring example to both docs** — one concrete competitor week, the exact
changes, the resulting `signals[]`, and the arithmetic down to a final number — and reconcile
the two formulas + define `SCALE` in the process. It's the cheapest possible edit, it forces
every scoring contradiction the council found into the open, and until it exists no one
(human or LLM) can actually implement the feature that is the entire point of the product.

---

## Appendix: Advisor Highlights

| Advisor | Sharpest point |
| --- | --- |
| **Contrarian** | Stuck-`pending` settle deadlock (no reaper), SSRF via `169.254.169.254`, score is non-deterministic "theater," `singletonKey` only dedupes active/queued not completed jobs. |
| **First Principles** | The real job is "tell me the few moves that change my quarter," not a scalar; weekly batch and the queue machinery are ~80% accidental complexity at this scale. |
| **Expansionist** | The longitudinal signal dataset is the real asset; pure-function scoring enables versioned scoring "policies," a sellable diff API, digests, and cross-tenant benchmarking. |
| **Outsider** | What does "73" mean? `SCALE` undefined, two formulas conflict, `signals.summary` vs schema mismatch — a newcomer can't ship the scorer from these docs. |
| **Executor** | First PR: delete junk `expresss` dep, add `config.ts`, move migrations off boot + advisory lock. Smallest vertical slice behind `/debug/run`; normalize() and per-source parsers are wildly underestimated. |
