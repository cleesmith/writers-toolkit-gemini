// proofreader-spelling.js
const ToolBase = require('./tool-base');

/**
 * Proofreader Spelling Tool
 * Analyzes manuscript specifically for spelling issues, focusing on word-by-word analysis while
 * being sensitive to intentional stylistic choices like dialogue and character voice.
 */
class ProofreaderSpelling extends ToolBase {
  constructor(apiService, config = {}) {
    super('proofreader_spelling', config);
    this.apiService = apiService;
  }
}

module.exports = ProofreaderSpelling;