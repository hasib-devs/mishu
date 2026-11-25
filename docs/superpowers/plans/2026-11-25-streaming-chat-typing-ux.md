# Streaming Chat Typing UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make assistant replies actually appear and read like a real chat — text streams in token by token with a live caret, a thinking indicator before the first token, and a gentle entrance animation.

**Architecture:** The worker already emits a valid AI SDK UI-message SSE stream (`start`, `text-start`, `text-delta`, `text-end`, `finish`). The custom `ChatTransport` currently parses OpenAI `choices[0].delta.content` and drops every delta. Fix the client parser to forward UI-message chunks, then layer the typing affordances on top in the chat component. No server changes.

**Tech Stack:** React 19, `@ai-sdk/react` v4, `ai` v7, Vite 8, Tailwind 4, motion/react.

**Spec:** Approved in conversation 2026-11-25 ("show response message as like real AI Chat typing UI/UX").

## Global Constraints

- Do not change `/api/chat/completions` request shape or worker code.
- Keep streaming authentic: no artificial delays or character-by-character replay of already-received text.
- Respect `useReducedMotion()` for all new motion.
- Verify with `pnpm run lint` and `pnpm run build`.

## Review Focus

1. AI SDK UI-message chunks (`text-delta`, `text-start`, `text-end`, `start`, `finish`) must all survive the transport — verify by feeding a captured SSE payload through `toUiMessageChunkStream`.
2. Legacy OpenAI-style `choices[0].delta.content` chunks must still work (kept as fallback).
3. `[DONE]`, malformed JSON lines, and blank lines must be ignored without breaking the stream.
4. No caret or thinking dots after the stream finishes.
5. Reduced-motion users get no bounce/pulse animation.

## Task 1: Transport speaks AI SDK UI-message protocol

**Files:** Modify `src/lib/chat-transport.ts`

- [ ] Step 1: Replace `emitBlock` with an SSE line decoder that forwards any parsed chunk with a `type` field as `UIMessageChunk`, keeping the OpenAI `choices[0]` fallback for legacy payloads; ignore `[DONE]` / malformed / blank lines.
- [ ] Step 2: Emit `start` / `finish` chunks in the null-body branch so the SDK lifecycle stays complete.
- [ ] Step 3: Verify by compiling with Node type stripping and feeding a captured SSE payload; assert `text-delta` deltas arrive in order.

## Task 2: Typing affordances in the chat UI

**Files:** Modify `src/components/ChatBox.tsx`, `src/components/markdown.tsx`, `src/App.css`

- [ ] Step 1: Add a `caret?: ReactNode` prop to `Markdown` and append it inside the last rendered block so it sits on the same line as streaming text.
- [ ] Step 2: Add a three-dot `ThinkingDots` indicator with staggered bounce (CSS keyframes in `App.css`).
- [ ] Step 3: In `ChatBox`, show thinking dots while the last assistant message has no text, a blinking caret while it has text and is streaming, and animate the assistant message in with the existing `slide-up` variants.
- [ ] Step 4: `pnpm run lint` and `pnpm run build` must pass.
