const { tryCatch } = require("../utils/errorHandler");
const getDirPath = require("../utils/getPaths");
const aiService = require("./aiService");
const fs = require("fs/promises");
const { exec } = require("child_process");
const path = require("path");
const { z } = require("zod");

class videoService {
  constructor() {
    this.queue = [];
    this.batchSize = 1;
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
          error: null,
        },
      });
    });
  }

  getPromptAndSchema(scene) {
    let outputSchema;
    let prompt;

    const COLOR_RULES = `
COLOR RULES:
- NEVER use Manim color constants directly (CYAN, MAGENTA, VIOLET, TEAL, INDIGO, LIME, AQUA, etc.) — many do not exist and will cause NameError
- Instead, define ALL custom colors as hex variables at the TOP of construct(), before anything else
- Example:
    def construct(self):
        CYAN = "#00FFFF"
        MAGENTA = "#FF00FF"
        TEAL = "#008080"
        NEON_GREEN = "#39FF14"
        # now use them freely
        func = grid.plot(lambda x: x**2, color=CYAN)
- Only these built-in colors are safe WITHOUT defining: WHITE, BLACK, RED, GREEN, BLUE, YELLOW, ORANGE, PINK, PURPLE, GRAY
- ANY other color MUST be defined as a hex variable first
`;

    if (scene.retries <= 0) {
      outputSchema = z.object({
        code: z.string().describe(
          "Complete Python Manim code, properly formatted with newlines and 4-space indentation. Never use semicolons to chain statements."
        ),
      });
      prompt = `
You are an expert in Manim (Mathematical Animation Engine).
Generate Python code for a Manim scene based on the following scene overview.

Scene Title: ${scene.scene.title}
Scene Overview: ${scene.scene.overview}
Voiceover: ${scene.scene.script}

Requirements:
1. The code must be valid Python with Manim CE (Community Edition) syntax
2. Use appropriate Manim classes: Scene, Text, MathTex, Rectangle, Circle, Arrow, etc.
3. Use dark background (#1a1a2e) with bright accent colors
4. The animation should match the visual overview exactly
5. Include proper imports at the top: from manim import *
6. Use the class name: Scene_${scene.scene.id}

CRITICAL FORMATTING RULES:
- Every statement must be on its own line
- Use 4-space indentation strictly
- NEVER chain statements with semicolons
- NEVER write the entire class or function on one line

TEXT AND MATH RULES:
- Use Text() for all labels, titles, and plain text
- Use MathTex() for mathematical expressions
- NEVER use LaTeX packages or custom LaTeX preambles
- NEVER use Tex() with custom LaTeX commands
- Keep MathTex expressions simple and standard (e.g., r"x^2", r"\\frac{a}{b}")

${COLOR_RULES}

Example structure:
from manim import *

class Scene_${scene.scene.id}(Scene):
    def construct(self):
        CYAN = "#00FFFF"
        TEAL = "#008080"
        
        self.camera.background_color = "#1a1a2e"
        
        title = Text("Your Title", color=WHITE)
        self.play(Write(title))
        self.wait(1)
`;
    } else {
      outputSchema = z.object({
        code: z.string().describe(
          "Fixed Python Manim code, properly formatted with newlines and 4-space indentation. Never use semicolons to chain statements."
        ),
      });
      prompt = `
You are an expert in Manim (Mathematical Animation Engine).
The following Manim code FAILED with this specific error. Do NOT regenerate the same code.
Carefully read the error, identify the exact line causing it, and fix it.

Original Scene Title: ${scene.scene.title}
Original Scene Overview: ${scene.scene.overview}
Voiceover: ${scene.scene.script}

ERROR:
${scene.retryData.error}

BROKEN CODE:
${scene.retryData.preCode}

Instructions:
1. Fix the exact error shown above — do NOT produce the same code again
2. Keep the same animation logic and visual design
3. Use the class name: Scene_${scene.scene.id}

CRITICAL FORMATTING RULES:
- Every statement must be on its own line
- Use 4-space indentation strictly
- NEVER chain statements with semicolons
- NEVER write the entire class or function on one line

TEXT AND MATH RULES:
- Use Text() for all labels, titles, and plain text
- Use MathTex() for mathematical expressions
- NEVER use LaTeX packages or custom LaTeX preambles
- NEVER use Tex() with custom LaTeX commands
- Keep MathTex expressions simple and standard (e.g., r"x^2", r"\\frac{a}{b}")

${COLOR_RULES}
`;
    }

    return { schema: outputSchema, prompt };
  }

  async generateScene(scene) {
    const { schema, prompt } = this.getPromptAndSchema(scene);

    const [data, error] = await tryCatch(() =>
      aiService.callLlm(prompt, schema)
    );

    if (error) {
      console.log("Error generating code:", error);
      return { data: null, error: { type: "api", err: error } };
    }

    await this.saveCodeToFile(scene.scene.id, data.code);
    return { data: data.code, error: null };
  }

  async saveCodeToFile(sceneId, code) {
    const codeDir = await getDirPath.getPathAndCreateIfNotAvailable("codeDir");
    const filePath = `${codeDir}/code_${sceneId}.py`;
    await fs.writeFile(filePath, code, "utf-8");
  }

  async runManimScene(sceneId) {
    const codeDir = await getDirPath.getPathAndCreateIfNotAvailable("codeDir");
    const winFilePath = path.join(codeDir, `code_${sceneId}.py`);

    const wslFilePath = winFilePath
      .replace(/\\/g, "/")
      .replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`);

    const className = `Scene_${sceneId}`;

    const cmd = `wsl bash -i -c "PYTHONIOENCODING=utf-8 manim -ql '${wslFilePath}'"`;

    return new Promise((resolve) => {
      exec(cmd, { encoding: 'utf8', timeout: 120_000 }, (err, stdout, stderr) => {
        if (err) {
          const errorOutput = stderr || stdout || err.message;
          resolve({ success: false, error: errorOutput });
        } else {
          resolve({ success: true, output: stdout });
        }
      });
    });
  }

  async processItem(item) {
    console.log(
      `[Scene ${item.scene.id}] Generating code (attempt ${item.retries + 1})…`
    );

    const { data: code, error: genError } = await this.generateScene(item);

    if (genError) {
      return { success: false, item, error: genError.err };
    }

    console.log(`[Scene ${item.scene.id}] Running Manim…`);
    const { success, error: manimError } = await this.runManimScene(
      item.scene.id
    );

    if (!success) {
      console.log(`[Scene ${item.scene.id}] Manim error:\n${manimError}`);
      return { success: false, item, error: manimError, code };
    }

    console.log(`[Scene ${item.scene.id}]  Done`);
    return { success: true, item };
  }

  async start(scenes) {
    this.createQueue(scenes);
    const results = new Array(scenes.length).fill(null);

    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.batchSize);

      const settled = await Promise.all(batch.map((item) => this.processItem(item)));

      for (const result of settled) {
        if (result.success) {
          results[result.item.index] = result.item.scene;
          continue;
        }

        const { item, error, code } = result;

        item.retries += 1;
        item.retryData.error = error;
        item.retryData.preCode = code ?? item.retryData.preCode;

        if (item.retries >= this.maxRetries) {
          console.error(
            `[Scene ${item.scene.id}] Max retries (${this.maxRetries}) reached. Aborting.`
          );

          this.queue = [];

          return [
            null,
            {
              message: `Scene ${item.scene.id} failed after ${this.maxRetries} attempts`,
              lastError: error,
              lastCode: item.retryData.preCode,
              sceneId: item.scene.id,
              sceneIndex: item.item?.index ?? item.index,
            },
          ];
        }

        console.warn(
          `[Scene ${item.scene.id}] Retry ${item.retries}/${this.maxRetries} queued.`
        );
        this.queue.unshift(item);
      }
    }

    return [results, null];
  }
}

module.exports = new videoService();
