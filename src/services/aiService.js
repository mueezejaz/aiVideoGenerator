const { generateObject } = require('ai');
const { createGoogleGenerativeAI } = require('@ai-sdk/google');
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

    const prompt = `You are an expert educational video scriptwriter. 
      
A user wants to learn about: "${query}"

Create a structured educational video with 4-6 scenes that:
1. Starts with an engaging introduction
2. Builds understanding step by step
3. Uses concrete examples and visual demonstrations
4. Ends with a summary/conclusion

For EACH scene provide:
- A short title
- A detailed VISUAL OVERVIEW for an animator (what to draw/animate using Python Manim library)
- A natural NARRATION SCRIPT to be spoken as voiceover
- Estimated duration in seconds

The visual overviews must be very specific about:
- What mathematical objects, shapes, graphs, or text to show
- How elements should appear, move, transform, or disappear
- Color choices (use a dark background #1a1a2e with bright accent colors)
- Coordinate positions and scale

Keep the total video under 3 minutes.`;

    // Wrap callLlm in a function for retries
    return await this.callWithRetry(() => this.callLlm(prompt, outputSchema));
  }
}

module.exports = new aiService();
