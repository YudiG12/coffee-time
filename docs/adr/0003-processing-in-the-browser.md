# ADR 0003: Compression, voice distortion and audio extraction in the browser

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-12 |
| **Deciders** | Yudi Ganeko |

## Context

Workers cannot run ffmpeg; server-side transcoding (Stream) costs money. Anonymous voices must be unrecognizable, ideally without the original ever reaching the server.

## Decision

In the browser, as soon as a file is picked or recorded:
- video re-encoded to 1080p at ~5 Mbps with WebCodecs (Mediabunny); photos resized to ~2000 px WebP;
- anonymous audio distorted (pitch + formant) before upload;
- the audio track of a video extracted and uploaded alongside it for transcription;
- upload starts immediately as a draft while the form is filled in.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Cloudflare Stream | Costs about US$ 5 per 1,000 stored minutes. |
| Upload originals, transcode later | No ffmpeg in Workers; 4K uploads of 300+ MB fail on 4G. |
| Distort the voice on the server | The original voice would reach the server, so anonymity depends on trusting it. |

## Consequences

- ~6x smaller uploads, near-instant **Send**.
- The original anonymous voice never leaves the device.
- Old browsers without WebCodecs upload the original (up to 300 MB) with a warning.
- Distortion quality needs an ear test before launch.
