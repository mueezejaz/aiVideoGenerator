const os = require("os")
const path = require("path")
const fs = require("fs/promises")

const _getDirPath = Object.freeze({
  audioDir: path.join(os.tmpdir(), "aivideo", "audios"),
  codeDir: path.join(os.tmpdir(), "aivideo", "code"),
  videoDir: path.join(os.tmpdir(), "aivideo", "videos"),
});

const getDirPath = {
  async getPathAndCreateIfNotAvailable(name) {
    const audioDir = _getDirPath[name];

    if (!audioDir) {
      throw new Error(`Invalid path key: ${name}`);
    }

    await fs.mkdir(audioDir, { recursive: true });
    return audioDir;
  },
};

module.exports = getDirPath;
