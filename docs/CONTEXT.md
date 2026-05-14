# Education Labs Take-Home — Domain Context

In-context learning affordance prototype: a single programming concept (Promise.all's all-or-nothing hang behavior) is encountered through a structured exchange inline in chat, captured as a card, and explored on a map and in a workshop.

## Language

**The arc**:
The full user journey from trigger message through workshop exploration.
_Avoid_: "the flow", "the exchange" (when meaning the whole journey)

**The trigger message**:
The pre-populated user message in `/new`'s composer. Sending it fires the affordance.

**The affordance**:
The two-button choice Claude offers in response to the trigger — "Just write the wrapper" / "Think it through first · ~90s".

**The wrapper path**:
The path taken when the user picks "Just write the wrapper". Produces an honest hang-handling response (try/catch outer wrapper around AbortController/timeout — not a naive try/catch, which wouldn't help).

**The learning path**:
The path taken when the user picks "Think it through first". Enters the structured exchange.

**The structured exchange**:
The predict + reveal + reflect sequence inline in the chat thread. Narrower than "the arc".
_Avoid_: "the exchange" alone when ambiguous

**A beat**:
One generated step inside the arc (affordance-prose, prediction-options, reveal, reflection-framing, card-meta, ghost-nodes, workshop-opening, workshop-chat).

**The card**:
The inline notecard rendered in chat after the exchange completes. Clicking Open opens the side panel.

**The map**:
Side-panel surface showing the user's concept territory. Central solid node + four labeled ghost nodes + atmospheric outer ring.

**Ghost node**:
A labeled adjacent-concept node on the map. Shows a hint on click; does not navigate.

**The workshop**:
Side-panel surface that replaces the map when the central node is clicked. Viz on left, chat on right.

**PrototypeState**:
The umbrella state object for everything specific to this prototype's demo flow — the arc, the concept, the map, the side panel. Lives alongside `ChatStore` but is its own concern.

## Relationships

- **The trigger message** fires **the affordance**, which gates **the wrapper path** vs **the learning path**.
- **The learning path** runs **the structured exchange** (predict → reveal → reflect), producing **the card**.
- **The card** opens **the map**.
- **The map**'s central node opens **the workshop**.
- **PrototypeState** holds the arc's beat, the chosen path, the prediction/reveal/reflection data, the card data, the map's ghost-node data, and the side panel's open/view state.

## Example dialogue

> **Dev:** "When the user clicks Open on **the card**, what's the transition to **the map**?"
> **Designer:** "Side panel slides in from the right; chat narrows to make room. **The map** is centered in the panel."

> **Dev:** "Does **PrototypeState** persist across reloads?"
> **Designer:** "No — single-arc demo, in-memory only. The localStorage cache for chats is separate."

## Flagged ambiguities

- "the exchange" was overloaded to mean both the structured predict+reveal+reflect AND the whole journey. Resolved: **the structured exchange** = predict + reveal + reflect only; **the arc** = the whole journey.
