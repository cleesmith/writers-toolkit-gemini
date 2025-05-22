// proofreader-spelling.js
const ToolBase = require('./tool-base');

/**
 * Proofreader Spelling Tool
 */
class ProofreaderSpelling extends ToolBase {
  constructor(apiService, config = {}) {
    super('proofreader_spelling', config);
    this.apiService = apiService;
  }
}

module.exports = ProofreaderSpelling;