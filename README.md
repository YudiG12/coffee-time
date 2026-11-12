<p align="center"><a href="https://www.youtube.com/@yudiganeko"><img src="docs/assets/banner.png" alt="Coffee Time: subscribers send a voice or video message, played in the vlog. A project by Yudi Ganeko" width="100%"></a></p>

<p align="center"><img alt="Cloudflare Workers" src="https://img.shields.io/badge/runtime-Cloudflare_Workers-F38020?style=flat-square&labelColor=1B2632&logo=cloudflare&logoColor=white"> <img alt="Workers AI" src="https://img.shields.io/badge/AI-Whisper_%2B_tags-5A4BD1?style=flat-square&labelColor=1B2632"> <img alt="MCP" src="https://img.shields.io/badge/agent-MCP-2F8A5B?style=flat-square&labelColor=1B2632"> <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-8A6A3F?style=flat-square&labelColor=1B2632"></a> <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3767A8?style=flat-square&labelColor=1B2632&logo=typescript&logoColor=white"></p>

**A site where subscribers send a short voice or video message to be played in the vlog's coffee segment.** No account, optional voice anonymization, transcripts and tags generated in the background, and a panel plus an MCP endpoint so an AI editor can pick the messages.

<p align="center"><img src="docs/assets/hld-light.png" alt="High-level design: subscribers and the owner reach one Worker on Cloudflare, which keeps media in R2 and messages in D1, and uses Workers AI for transcripts and tags" width="720"></p>
<p align="center"><sub>Details in <a href="ARCHITECTURE.md">ARCHITECTURE.md</a>.</sub></p>

## Screens

<p align="center"><img src="docs/design/mobile-1a-start.png" alt="Start: record audio or send a file" width="230"> <img src="docs/design/mobile-1b-recording.png" alt="Recording" width="230"> <img src="docs/design/mobile-1-audio-ready.png" alt="Audio ready to send" width="230"></p>
<p align="center"><img src="docs/design/panel-list.png" alt="Owner panel: messages with transcripts and tags" width="720"></p>

## Links

[Architecture](ARCHITECTURE.md) · [Decisions (ADRs)](docs/adr/) · [PRD](docs/PRD.md) · [Flows](ARCHITECTURE.md#flows) · [Design](docs/design/) · [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [MIT license](LICENSE)
