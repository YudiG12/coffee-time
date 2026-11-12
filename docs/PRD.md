# Coffee Time · PRD v1

## Problem
The owner (a dev YouTuber, ~120k subscribers) wants a "coffee" segment in his vlogs: he sits in a café, plays subscribers' messages and answers. Today there is no easy way for people to send a voice or video message, and no tidy way for him (and his AI video editor) to find, listen to and download them.

## Users
- **Subscriber**: on phone or desktop, no account. Wants to send something in under a minute.
- **Owner**: listens, picks favorites, downloads.
- **AI agent** (the editor): reads approved messages and media through MCP.

## v1 scope

### Send (public site, Portuguese)
Screens: [docs/design/](design/) (`mobile-*`, `desktop-*`).
1. **Start**: only the choice Audio / Video, a big **Gravar áudio** button and **Envie um arquivo**. Hint: "Áudio ou vídeo de até 90 segundos." Below: "Como fica no vlog" (placeholder until real clips exist).
2. **Recording**: pulsing mic, large timer, "máximo de 90 segundos", stop button. Stops by itself at 90 s.
3. **Ready** (only after a recording or file exists):
   - audio: play/re-record; **Anonimizar voz** toggle ("O áudio fica distorcido e sua voz não é reconhecida.");
   - video: preview, "Trocar vídeo"; no anonymous option;
   - optional name; up to 10 photos with the nudge "Manda uma foto sua! Se sua mensagem entrar no vlog, eu mostro você no vídeo.";
   - consent checkbox: "Autorizo o uso deste envio nos vídeos do canal, conforme a política de privacidade.";
   - **Enviar** (disabled until media + consent); upload progress bar shown while the file uploads in the background.
4. **Thanks**: "Valeu demais!", thank-you text, "Quer remover seu envio? Escreva para contato@yudiganeko.com.", **Enviar outro**.

Rules: exactly one audio or one video (≤ 90 s); compression and upload start as soon as the file is picked; anonymous mode is audio-only and hides the name field; a privacy page explains deletion by e-mail and that published videos stay online.

### Panel (owner, behind Access)
Screens: `panel-list.png`, `panel-detail.png`.
- List: photo (or audio/video icon), name, what they said (transcript excerpt) with tag pills, duration, date, status. Filters: status (Novo, Favorito, Usado, Todos) and tags. Search in transcripts.
- Detail: player, full transcript, photos, status switch (Novo → Favorito → Usado), tags (auto, editable), **Baixar arquivos (.zip)** (media + transcript), **Apagar envio**.

### Background
- Transcription (Whisper, pt-BR) and **free-form tags** from a text model, saved with the submission. A submission without a transcript still shows ("Transcrevendo…").
- Hourly sweep: confirm uploads the phone never confirmed; delete drafts after 24 h and failed sends after 7 days.

### AI agent (MCP, Bearer token)
Tools: `list_submissions` (filters: status, tags, text), `get_submission` (transcript, tags, name, photos, signed media download URLs), `set_status`. Goal: the AI video editor finds, reads and downloads messages without the owner exporting anything by hand.

## Out of v1
Subscriber accounts or status updates; deletion link; anonymous video; LinkedIn field (removed); vlog clip on the home (mockup ready, needs real videos); notifications.

## Success
- A subscriber goes from opening the page to "Valeu demais!" in under 60 s for an audio message.
- Zero lost messages: every confirmed send ends up in the panel with media.
- Monthly cost stays at US$ 0 until ~10 GB of media.

## Risks
Public anonymous endpoint (Turnstile, IP rate limit, expiring signed URLs, quarantine with real-type check); old phones without WebCodecs (upload original up to 300 MB with a warning); weak voice distortion (pitch + formant, ear test before launch); unstable 4G (multipart upload that resumes).
