# Weekly report depth

Weekly contract v14 preserves the report layout and factual safeguards while allowing six distinct findings and two prioritized actions. The generation prompt asks for 4–6 findings and 1–2 actions when supported; sparse records may produce fewer. Older reports also show only the two highest-ranked distinct actions.

The short summary provides the verdict; the weekly synthesis connects the patterns; findings provide observations, original evidence and practical takeaways; actions provide a routine cue, steps, an easier fallback and a measurable seven-day endpoint. Optional unresolved questions include a next check. Neither the generator nor renderer duplicates these as highlights or domain recap cards.

The evidence ledger now includes recorded training days, saved session focus counts and matched session feedback coverage, alongside existing meals, feedback, check-ins, measurements and comparable prior-period evidence. No quantities or outcomes are inferred from missing records.

An independent source review checks semantic repetition. Deterministic checks reject repeated summaries, core findings, action targets and rationales, and participate in the existing bounded repair flow. Final normalized reports are checked again. The app additionally filters repeated wording and source excerpts for older saved reports. Number and negation differences are preserved by the similarity checks; this is a conservative safeguard, not a guarantee of detecting every possible paraphrase.

Existing reports remain available during background regeneration. The schema version triggers the normal background update when an older report is requested. This change does not bulk-regenerate accounts or alter archived report snapshots. Diet report content limits and layout remain unchanged.

Validation: 333 app tests and 189 backend tests pass, including expanded reports, duplicate filtering, source evidence, the two-priority limit, navigation and unresolved questions. Live LLM output has not been manually regenerated as part of this change.


The weekly presentation follows the diet report: contextual SVG tiles, individual insight cards with independently expandable source notes, short summary bullets, and separate recommendation cards with numbered steps, an easier alternative and a check-in target. Existing editorial cover artwork is reused. Artwork stacks above headings on narrow screens or with larger text; card height follows its contents.

Narrative generation targets 12–22 words per sentence, with a deterministic maximum of 32 after verified fact expansion. The same rules apply in source review, bounded repair and final normalization. Original evidence is excluded from these editorial limits. The renderer separates sentences without rewriting numbers or dropping long legacy observations. Decimal measurements, quoted sentence endings and common abbreviations have regression coverage.

Source notes start collapsed. Each “In your records” button exposes its expanded state to accessibility services and reveals the complete retained evidence set when opened.
