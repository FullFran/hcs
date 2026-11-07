# ADR-0024: Every permission decision is recorded, and an unrecorded decision is a deny

**Status:** Proposed (2026-11-07)

## Context

HCS-0005 says when a host must deny (R001) and that revocation applies at the next dispatch (R003), but not that decisions are kept. After an incident, the question is "who allowed this tool to send that mail, and when"; in hosts that process customer data it is also a compliance need. Issue #36.

## Decision

- A host writes a decision record for every permission decision it acts on (allow, deny, timeout, error) and for every grant or denial it removes (HCS-0005-R010).
- The record names the entry, permission, operation id, session, outcome, decider (`subject`, `grant`, `denial` or `policy`), channel and time, and the ACP option kind when a person answered. It never holds the operation's arguments, result or conversation content (R011); the schema has no member for them.
- A decision that cannot be recorded is a deny (R012), so the record cannot silently fall behind the decisions.
- A grant created by an "always" answer carries the id of the record of that answer (`origin`, ADR-0023), so a decision made by a stored grant traces back to the person and the moment.
- Records sent to a distribution SHOULD be CloudEvents 1.0.2 events, as observed state is (R013, HCS-0007-R021).

## Consequences

- Hosts need durable local storage for records before they can allow anything; a full disk turns into denials, which is the intended failure.
- Alternatives rejected: recording only denials (allows are what an incident investigation needs); recording payloads for context (the record would then hold the data a content-safety guard exists to keep out, #29).
- Still open: retention and pseudonymous subject ids (OQ-0005-6); where records go and their CloudEvents type and OpenTelemetry attributes (OQ-0005-7, with OQ-0004-3).
