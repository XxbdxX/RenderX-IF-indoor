# API Provider Floating Settings Design

## Goal

Replace the inline Gemini key form with a compact floating entry point and add support for switching between Google AI Studio and Vertex AI without introducing a backend.

## Decisions

- Keep the app pure frontend for this iteration.
- Store one normalized provider config in `localStorage`.
- Migrate the legacy `renderx_gemini_api_key` value to the new config shape on load.
- Move API configuration into a bottom-right floating circular button with a lightweight popover panel.
- Keep generation blocked until a valid saved config exists.

## Config Model

```ts
interface ApiProviderConfig {
  provider: 'google-ai-studio' | 'vertex-ai'
  apiKey: string
  vertexProject?: string
  vertexLocation?: string
}
```

Notes:

- `apiKey` is required for both providers.
- `vertexProject` and `vertexLocation` remain optional in the UI.
- `vertexLocation` defaults to `global` when Vertex AI is selected.

## UI Flow

- Show a floating action button at the bottom-right on every page state.
- Use status color to indicate configured vs unconfigured state.
- Clicking the button opens a compact settings panel.
- The panel provides provider switching, key entry, optional Vertex fields, save, and clear actions.
- On first load without saved credentials, open the panel automatically.

## Service Layer

- Change `generateRendering` to accept `ApiProviderConfig` instead of a raw string key.
- Initialize `@google/genai` with:
  - AI Studio: `{ apiKey }`
  - Vertex AI: `{ vertexai: true, apiKey, project?, location? }`

## Validation

- Add tests for Vertex client initialization.
- Add tests that the floating trigger exists in `App`.
- Add tests that `ControlPanel` no longer renders the inline key block.
