const path = require("path");
const fs = require("fs/promises");
const { existsSync } = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
const ffprobeInstaller = require("@ffprobe-installer/ffprobe");
const getDirPath = require("../utils/getPaths");

// Configure ffmpeg and ffprobe binaries
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

class mergeService {
  /**
   * Merge a single video file with its corresponding audio file.
   * The output duration matches the shorter stream (video/audio).
   *
   * @param {string} videoPath  Absolute path to the input video (.mp4)
   * @param {string} audioPath  Absolute path to the input audio (.mp3)
   * @param {string} outputPath Absolute path for the merged output (.mp4)
   * @returns {Promise<string>} Resolves with outputPath on success
   */
  mergeVideoWithAudio(videoPath, audioPath, outputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .outputOptions([
          "-map 0:v:0",       // Take video from first input
          "-map 1:a:0",       // Take audio from second input
          "-c:v copy",        // Copy video stream (no re-encoding)
          "-c:a aac",         // Convert audio to AAC (MP4 compatible)
          "-b:a 192k",
          "-shortest",        // Trim output to shortest stream
          "-movflags +faststart", // Optimize for streaming
        ])
        .output(outputPath)
        .on("end", () => resolve(outputPath))
        .on("error", (err) => reject(err))
        .run();
    });
  }

  /**
   * Concatenate multiple MP4 files into a single video.
   * Uses FFmpeg concat demuxer (requires compatible streams).
   *
   * @param {string[]} videoPaths Ordered list of video file paths
   * @param {string} outputPath   Output file path
   * @returns {Promise<string>} Resolves with outputPath on success
   */
  async concatenateVideos(videoPaths, outputPath) {
    const concatListPath = outputPath.replace(/\.mp4$/, "_concat_list.txt");

    // Create FFmpeg concat list file
    const listContent = videoPaths
      .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
      .join("\n");

    await fs.writeFile(concatListPath, listContent, "utf-8");

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(concatListPath)
        .inputOptions(["-f concat", "-safe 0"])
        .outputOptions([
          "-c:v libx264",     // Re-encode to ensure consistency
          "-c:a aac",
          "-b:a 192k",
          "-crf 23",
          "-preset fast",
          "-movflags +faststart",
        ])
        .output(outputPath)
        .on("end", async () => {
          await fs.unlink(concatListPath).catch(() => { });
          resolve(outputPath);
        })
        .on("error", async (err) => {
          await fs.unlink(concatListPath).catch(() => { });
          reject(err);
        })
        .run();
    });
  }

  /**
   * Main workflow:
   * 1. Locate raw Manim-generated videos
   * 2. Merge each video with its corresponding audio
   * 3. Concatenate all merged clips into a final video
   *
   * @param {Array<{ id: number, title: string }>} scenes Scene metadata
   * @param {string} [rawVideosDir] Optional override for raw video directory
   * @returns {Promise<[string|null, object|null]>}
   */
  async start(scenes, rawVideosDir) {
    try {
      const audioDir = await getDirPath.getPathAndCreateIfNotAvailable("audioDir");
      const videoDir = await getDirPath.getPathAndCreateIfNotAvailable("videoDir");

      const mergedDir = path.join(videoDir, "merged");
      const finalDir = path.join(videoDir, "final");

      await fs.mkdir(mergedDir, { recursive: true });
      await fs.mkdir(finalDir, { recursive: true });

      // Step 1: Locate raw videos
      const rawVideoMap = await this._findManimVideos(videoDir, scenes);

      // Step 2: Merge each scene's video and audio
      console.log("[mergeService] Merging audio into videos...");
      const mergedPaths = [];

      for (const scene of scenes) {
        const sceneId = scene.id;
        const videoPath = rawVideoMap[sceneId];
        const audioPath = path.join(audioDir, `audio_${sceneId}.mp3`);

        if (!videoPath || !existsSync(videoPath)) {
          throw new Error(`Missing video for Scene ${sceneId}`);
        }

        if (!existsSync(audioPath)) {
          throw new Error(`Missing audio for Scene ${sceneId}: ${audioPath}`);
        }

        const mergedPath = path.join(mergedDir, `merged_${sceneId}.mp4`);

        console.log(`[mergeService] Scene ${sceneId}: merging...`);
        await this.mergeVideoWithAudio(videoPath, audioPath, mergedPath);
        console.log(`[mergeService] Scene ${sceneId}: done`);

        mergedPaths.push({ id: sceneId, path: mergedPath });
      }

      // Ensure correct order
      mergedPaths.sort((a, b) => a.id - b.id);
      const orderedPaths = mergedPaths.map((m) => m.path);

      // Step 3: Concatenate all videos
      const finalVideoPath = path.join(
        finalDir,
        `final_video_${Date.now()}.mp4`
      );

      console.log("[mergeService] Concatenating final video...");
      await this.concatenateVideos(orderedPaths, finalVideoPath);

      console.log(`[mergeService] Final video ready: ${finalVideoPath}`);

      return [finalVideoPath, null];
    } catch (err) {
      console.error("[mergeService] Error:", err);
      return [null, { message: err.message, err }];
    }
  }

  /**
   * Find Manim-generated videos and map them by scene ID.
   * Selects the most recently modified file if duplicates exist.
   *
   * @param {string} rootDir Root directory to search
   * @param {Array<{ id: number }>} scenes Scene list
   * @returns {Promise<Record<number, string>>}
   */
  async _findManimVideos(rootDir, scenes) {
    const map = {};
    const allMp4s = await this._walkForMp4s(rootDir);

    for (const scene of scenes) {
      const fileName = `Scene_${scene.id}.mp4`;

      const matches = allMp4s.filter(
        (f) => path.basename(f) === fileName
      );

      if (matches.length > 0) {
        const withStats = await Promise.all(
          matches.map(async (f) => ({
            file: f,
            mtime: (await fs.stat(f)).mtimeMs,
          }))
        );

        withStats.sort((a, b) => b.mtime - a.mtime);
        map[scene.id] = withStats[0].file;
      }
    }

    return map;
  }

  /**
   * Recursively scan directory for .mp4 files.
   * Excludes generated output folders ("merged", "final").
   *
   * @param {string} dir Directory to scan
   * @returns {Promise<string[]>}
   */
  async _walkForMp4s(dir) {
    let results = [];

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return results;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === "merged" || entry.name === "final") continue;

        const nested = await this._walkForMp4s(fullPath);
        results = results.concat(nested);
      } else if (entry.isFile() && entry.name.endsWith(".mp4")) {
        results.push(fullPath);
      }
    }

    return results;
  }
}

module.exports = new mergeService();
