const { tryCatch } = require("../utils/errorHandler");
const getDirPath = require("../utils/getPaths");
const aiService = require("./aiService");
const fs = require("fs/promises")

class videoService {
  constructor() {
    this.queue = [];
    this.batchSize = 3;
    this.maxRetries = 3;
  }

  createQueue(scenes) {
    scenes.forEach((val, ind) => {
      this.queue.push({
        scene: val,
        index: ind,
        retries: 0,
        retryData: {
          preCode: null,
          error: null
        }
      });
    });
  }
  getPromptAndSchema(scene) {
    let outputSchema;
    let prompt;
    if (scene.retries <= 0) {
      outputSchema = z.object({
        code: z.string().describe('Complete Python Manim code for this scene')
      });
      prompt = `
You are an expert in Manim (Mathematical Animation Engine).
Generate Python code for a Manim scene based on the following scene overview.

Scene Title: ${scene.title}
Scene Overview: ${scene.overview}
Voiceover: ${scene.script}

Requirements:
1. The code must be valid Python with Manim CE (Community Edition) syntax
2. Use appropriate Manim classes: Scene, Mobject, Text, MathTex, Rectangle, Circle, etc.
3. Use dark background (#1a1a2e) with bright accent colors
4. The animation should match the visual overview exactly
5. Include proper imports and structure
6. Output ONLY the Python code, no explanations
7. Use the class name: Scene_${scene.id}

Example structure:
from manim import *

class Scene_${scene.id}(Scene):
    def construct(self):
        # Your animation code here
        pass
`;

    } else {
      outputSchema = z.object({
        code: z.string().describe('Fixed Python Manim code for this scene')
      });

      prompt = `
You are an expert in Manim (Mathematical Animation Engine).
The following Manim code has an error. Fix it.

Original Scene Title: ${scene.title}
Original Scene Overview: ${scene.overview}
Voiceover: ${scene.script}

Error Message:
${scene.retryData.error}

Broken Code:
${scene.retryData.preCode}

Instructions:
1. Fix the error in the code
2. Keep the same animation logic and visual design
3. Output ONLY the valid fixed Python code
4. Use the class name: Scene_${scene.id}
`;
    }
    return { schema, prompt };
  }

  async generateScene(scene) {
    const { schema, prompt } = this.getPromptAndSchema(scene);

    const { data, error } = await tryCatch(() =>
      aiService.callLlm(prompt, schema)
    );

    if (error) {
      console.log("Error generating code:", error);
      return { data: null, error: { type: "api", err: error } };
    }

    await this.saveCodeToFile(scene.id, data.code);

    return { data: data.code, error: null };
  }

  async saveCodeToFile(sceneId, code) {
    const codeDir = await getDirPath.getPathAndCreateIfNotAvailable("codeDir");
    const filePath = `${codeDir}/code_${sceneId}.py`;
    await fs.writeFile(filePath, code, "utf-8");
  }
  async start(scenes) {
    this.createQueue(scenes);

    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.batchSize);

    }
  }
}

module.exports = new videoService();
