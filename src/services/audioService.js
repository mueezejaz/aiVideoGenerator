const getDirpath = require('../utils/getPaths.js')
const { EdgeTTS } = require('edge-tts-universal');
const fs = require('fs/promises');
const { tryCatch } = require('../utils/errorHandler.js');

class audioService {
  async AudioGenerater(script, audioPath) {
    const tts = new EdgeTTS(script, 'en-US-EmmaMultilingualNeural');
    const result = await tts.synthesize();
    const audioBuffer = Buffer.from(await result.audio.arrayBuffer());
    await fs.writeFile(audioPath, audioBuffer);
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
      console.log("failded to generate audio", error)
    }
    return [data, null];
  }

  async convertScriptsToAudio(scenes) {
    const audioDir = await this.getAudioDirPath();

    const promises = scenes.map((s, index) =>
      this.callWithRetry(() => this.AudioGenerater(s.script, `${audioDir}/audio_${index}.mp3`), 3)
    );

    await Promise.all(promises);
    console.log("All audio files generated!");
  }

  async getAudioDirPath() {
    return await getDirpath.getPathAndCreateIfNotAvailable("audioDir");
  }
}
module.exports = new audioService();
