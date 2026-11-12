# ADR 0004 · Transcription and free-form tags with Workers AI on a Queue

**Status:** accepted · 2026-11-12

## Context
The owner and his AI editor need to find messages by what was said and filter by topic. The subscriber must not wait.

## Decision
A Queue job per submission: read the audio from R2, transcribe with Whisper (pt-BR), then ask a Workers AI text model for **free-form** tags (type such as "Dúvida"/"História" plus topics). Save transcript and tags in D1. Tags are editable in the panel. Retries with backoff, then a dead-letter queue; the submission stays visible without text.

## Consequences
- Search, tag filters and the MCP get structured data at near-zero cost.
- Free tags can drift (synonyms); the owner can edit, and a fixed list can be introduced later.
