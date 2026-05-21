/**
 * AI PPT generation provider.
 *
 * Uses the existing LLM infrastructure (callLLMJson) to generate slide decks
 * from a topic/brief/sourceText. Falls back gracefully on any LLM failure.
 */

import { callLLMJson } from "./llm-client.js";
import type {
  WebAigcAiPptGenerationInput,
  WebAigcAiPptDeck,
  WebAigcAiPptSlide,
} from "../../shared/web-aigc-ai-ppt.js";

interface LLMSlide {
  title?: string;
  bullets?: string[];
  speakerNotes?: string;
}

/**
 * Generate a presentation deck using LLM.
 *
 * Sends a structured prompt to the LLM asking for slide content in JSON format,
 * then normalizes the response into the expected deck structure.
 *
 * Throws on LLM failure — callers should catch and fall back to buildFallbackDeck.
 */
export async function generateDeckViaLLM(
  input: WebAigcAiPptGenerationInput,
): Promise<Omit<WebAigcAiPptDeck, "generationMode">> {
  const topic = input.topic || input.brief || input.sourceText || "Presentation";
  const slideCount = input.slideCount || 5;
  const audienceClause = input.audience
    ? `The target audience is: ${input.audience}.`
    : "";
  const localeClause = input.locale
    ? `Use language/locale: ${input.locale}.`
    : "";
  const sourceClause = input.sourceText
    ? `\n\nReference material:\n${input.sourceText.slice(0, 2000)}`
    : "";
  const briefClause = input.brief
    ? `\n\nBrief/outline:\n${input.brief.slice(0, 1000)}`
    : "";

  const systemPrompt = `You are a professional presentation designer. Generate structured slide content in JSON format. Be concise and informative.`;

  const userPrompt = `Generate a presentation with exactly ${slideCount} slides about: "${topic}".
${audienceClause}
${localeClause}
${briefClause}
${sourceClause}

Return a JSON object with this exact structure:
{
  "title": "Presentation title",
  "summary": "One sentence summary of the presentation",
  "slides": [
    {
      "title": "Slide title",
      "bullets": ["Point 1", "Point 2", "Point 3"],
      "speakerNotes": "Optional speaker notes"
    }
  ]
}

Requirements:
- Exactly ${slideCount} slides
- Each slide should have 3-5 bullet points
- First slide should be an overview/introduction
- Last slide should be a conclusion/action items
- Keep bullet points concise (under 20 words each)`;

  const result = await callLLMJson<{
    title?: string;
    summary?: string;
    slides?: LLMSlide[];
  }>(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    { temperature: 0.7, maxTokens: 2000 },
  );

  const title = typeof result.title === "string" && result.title.trim()
    ? result.title.trim()
    : topic;

  const summary = typeof result.summary === "string" && result.summary.trim()
    ? result.summary.trim()
    : `A presentation about ${topic}.`;

  const rawSlides = Array.isArray(result.slides) ? result.slides : [];

  const slides: WebAigcAiPptSlide[] = rawSlides
    .slice(0, slideCount)
    .map((slide, index) => ({
      slideNumber: index + 1,
      title:
        typeof slide.title === "string" && slide.title.trim()
          ? slide.title.trim()
          : `Slide ${index + 1}`,
      bullets: Array.isArray(slide.bullets)
        ? slide.bullets
            .filter((b): b is string => typeof b === "string")
            .map(b => b.trim())
            .filter(Boolean)
            .slice(0, 8)
        : [`Key point about ${topic}`],
      ...(typeof slide.speakerNotes === "string" && slide.speakerNotes.trim()
        ? { speakerNotes: slide.speakerNotes.trim() }
        : {}),
    }));

  // Ensure we have the requested number of slides
  while (slides.length < slideCount) {
    const idx = slides.length;
    slides.push({
      slideNumber: idx + 1,
      title: `${topic} — Part ${idx + 1}`,
      bullets: [`Continue exploring ${topic}`, "Additional details", "Next steps"],
    });
  }

  return { title, summary, slides };
}
