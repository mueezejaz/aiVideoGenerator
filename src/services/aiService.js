const { generateObject } = require('ai');
const { createGoogleGenerativeAI, google } = require('@ai-sdk/google');
const { z } = require('zod');
const { tryCatch } = require('../utils/errorHandler.js');

class aiService {
  constructor() {
    this.googleAi = createGoogleGenerativeAI({
    });
    this.defaultModel = "gemini-3.1-flash-lite-preview"
  }

  getModel(modelName) {
    return this.googleAi(modelName || this.defaultModel)
  }

  async callLlm(prompt, outputSchema, modelName) {
    const { object } = await generateObject({
      model: this.getModel(modelName),
      schema: outputSchema,
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingLevel: 'high',
          }
        }
      },
      prompt,
    });
    console.log("this is object", object)
    return object;
  }

  async callWithRetry(fun, maxRetries = 2, tries = 0, lastError = null) {
    if (tries >= maxRetries) {
      const error = {
        type: "apiCall",
        message: `Failed after retrying ${tries} times`,
        err: lastError || "custom",
      };
      return [null, error];
    }

    const [data, error] = await tryCatch(fun);
    if (error) {
      return this.callWithRetry(fun, maxRetries, tries + 1, error);
      console.log("failed to call api", error)
    }
    return [data, null];
  }

  async generateScriptAndOverview(query) {
    const outputSchema = z.object({
      scenes: z.array(
        z.object({
          id: z.number(),
          title: z.string().describe('Short title for the scene'),
          overview: z.string().describe(
            'Detailed visual overview for the animator: describe exactly what should appear on screen, ' +
            'what objects/shapes/text/diagrams should be shown, and how they should move or transform. ' +
            'Be specific about colors, positions, and transitions.'
          ),
          script: z.string().describe(
            'The full narration/voiceover text for this scene. This is what will be spoken aloud. ' +
            'Should be clear, educational, and timed to roughly 15-30 seconds when spoken.'
          ),
          estimatedDurationSeconds: z.number().describe('Estimated duration in seconds when narrated at a natural pace')
        })
      )
    });

    const prompt = `You are an expert educational video scriptwriter and Manim animation director.

A user wants to learn about: "${query}"

Create a structured educational video with 4-6 scenes. Each scene MUST be completely self-contained — never start a concept and continue it in the next scene. Every idea introduced in a scene must be fully explained and concluded within that same scene. If a concept requires more time, allocate more duration to that scene rather than splitting it.

---

GLOBAL STYLE RULES (apply to every scene):
- Background: deep navy #1a1a2e
- Primary accent: bright cyan #00d4ff
- Secondary accent: vivid yellow #ffd166
- Tertiary accent: soft coral #ef476f
- Text: clean white #ffffff, use LaTeX for all equations
- Transitions: smooth fade-ins (0.4s), slide-ins from logical directions
- Never leave the screen empty — always have at least one visual element present

---

SCENE STRUCTURE:
1. Opening scene — hook the viewer with a striking visual or question, introduce the overall topic
2. Core concept scenes (2–4) — each covers ONE complete idea from introduction to conclusion
3. Closing scene — visual summary, key takeaways, and a memorable closing moment

---

For EACH scene provide all four of the following fields:

TITLE: A short, descriptive title (5 words or fewer)

VISUAL OVERVIEW: Write this as a detailed Manim animation director's script. Be exhaustive and specific:
  - List every object that appears on screen (shapes, axes, graphs, equations, labels, arrows, highlights)
  - Describe the exact entrance animation for each object (Write(), FadeIn(), DrawBorderThenFill(), GrowFromCenter(), etc.)
  - Specify on-screen positions using Manim coordinates (e.g., UP*2 + LEFT*3, ORIGIN, DOWN*1.5)
  - Describe all transformations mid-scene (Transform(), ReplacementTransform(), ApplyMethod(), shift, scale, rotate)
  - Describe all color changes, highlights, or emphasis moments (Indicate(), Flash(), Circumscribe(), SurroundingRectangle())
  - Describe how elements exit (FadeOut, shift off-screen, dissolve into next element)
  - Specify timing cues (e.g., "after 2 seconds", "simultaneously with narration beat 3", "hold for 1.5s then transition")
  - Note any camera movements (self.camera.frame.animate.move_to(), zoom in/out)
  - The overview must be long enough that an animator could implement it directly — aim for 150–250 words per scene

NARRATION SCRIPT: The full spoken voiceover. Must:
  - Be conversational, clear, and educational
  - Fully explain the concept without relying on visuals to fill gaps
  - Be timed to the animation (mention pacing cues if needed)
  - Complete every thought — no cliffhangers or "we'll see this next time"
  - Target 120–180 words per scene (roughly 45–70 seconds at natural pace)

ESTIMATED DURATION: In seconds. Must be long enough to fully deliver the concept — do not rush. Minimum 40 seconds per scene.

---

CRITICAL RULES:
- Every concept introduced must be resolved in the same scene
- No scene should depend on the previous or next scene to make sense
- The visual overview must be the most detailed section — this drives the entire animation
- Prioritize animation richness: use transforms, morphs, moving graphs, color pulses, and drawing effects over static images
- If a scene covers a multi-step process, animate each step sequentially with clear visual separation
`;

    // Wrap callLlm in a function for retries
    return await this.callWithRetry(() => this.callLlm(prompt, outputSchema));
  }
}

module.exports = new aiService();
