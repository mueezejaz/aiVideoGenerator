const getDirpath = require('../utils/getPaths.js')
const { EdgeTTS } = require('edge-tts-universal');
const fs = require('fs/promises');
const ffmpeg = require('fluent-ffmpeg');
const { tryCatch } = require('../utils/errorHandler.js');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);
class audioService {
  async AudioGenerater(script, audioPath) {
    const tts = new EdgeTTS(script, 'en-US-EmmaMultilingualNeural');
    const result = await tts.synthesize();
    const audioBuffer = Buffer.from(await result.audio.arrayBuffer());
    await fs.writeFile(audioPath, audioBuffer);
    return audioPath;
  }

  async getAudioDurations(scenes) {
    const audioDir = await this.getAudioDirPath();

    const promises = scenes.map((_, index) => {
      const audioPath = `${audioDir}/audio_${index + 1}.mp3`;
      return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(audioPath, (err, metadata) => {
          if (err) return reject(err);
          resolve(metadata.format.duration); // float, in seconds
        });
      });
    });

    return await Promise.all(promises); // [3.21, 5.87, 2.44, ...]
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
      console.log("failded to generate audio", error)
      return this.callWithRetry(fun, maxRetries, tries + 1, error);
    }
    return [data, null];
  }

  async convertScriptsToAudio(scenes) {
    const audioDir = await this.getAudioDirPath();

    const promises = scenes.map((s, index) =>
      this.callWithRetry(() => this.AudioGenerater(s.script, `${audioDir}/audio_${index + 1}.mp3`), 3)
    );

    await Promise.all(promises);
    console.log("All audio files generated!");
  }

  async getAudioDirPath() {
    return await getDirpath.getPathAndCreateIfNotAvailable("audioDir");
  }
}
module.exports = new audioService();
