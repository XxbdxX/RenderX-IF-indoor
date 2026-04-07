# Render Concurrency Design

## Goal

Change the render queue limit from the current mixed policy to a single global concurrency cap of 5.

## Scope

- Keep the existing request counters in `App.tsx`
- Replace the current 1K/2K vs 4K gating rule with one shared limit
- Update the queue-full message so it matches the new behavior

## Approach

Use a single constant, `MAX_CONCURRENT_REQUESTS`, and allow a new request whenever the sum of active standard and heavy requests is below that limit.

This keeps the change small and avoids touching the rest of the request lifecycle, which already increments and decrements counters correctly.

## Validation

- Up to 5 mixed render tasks can start concurrently
- The 6th task is rejected with the updated queue-full message
- Existing build should continue to pass without broader refactoring
