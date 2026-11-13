// Fake Workers AI for `npm run verify` (never deployed): verify runs the Worker with a config where AI is a service
// binding to this entrypoint, so the queue consumer gets fixed outputs offline.
// Audio containing the bytes "FAILJOB" makes Whisper throw (retries, then the dead-letter queue); "SLOWJOB" makes it
// take 10 s, so the panel can be seen saying "Transcrevendo…". Whisper must be asked for Portuguese.
import { WorkerEntrypoint } from "cloudflare:workers";

const TRANSCRIPT = "Oi Yudi, sou de Lisboa e queria saber como você organiza a semana entre trabalho e vlog.";
export class AiStub extends WorkerEntrypoint {
  async run(model, input) {
    if (model.includes("whisper")) {
      if (input?.language !== "pt") throw new Error(`stub: whisper asked for ${input?.language}`);
      const audio = atob(input?.audio || "");
      if (audio.includes("FAILJOB")) throw new Error("stub: whisper failed");
      if (audio.includes("SLOWJOB")) await new Promise((r) => setTimeout(r, 10000));
      return { text: `  ${TRANSCRIPT}  `, word_count: 16 };
    }
    // Messy on purpose: duplicate, extra spaces and a long topic, to test the cleanup.
    return { response: { type: "Dúvida", topics: ["  Rotina ", "rotina", "Lisboa", "Um tema comprido demais para caber numa etiqueta"] } };
  }
}
export default { fetch: () => new Response("ai stub") };
