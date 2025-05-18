// proofreader-plot-consistency.js
const ToolBase = require('./tool-base');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs/promises');

/**
 * Proofreader Plot Consistency Tool
 * Tracks narrative elements, world rules, and story logic
 * Utilizes Gemini's file and cache systems for efficient processing of large manuscripts.
 */
class ProofreaderPlotConsistency extends ToolBase {
  /**
   * Constructor
   * @param {Object} apiService - AI API service
   * @param {Object} config - Tool configuration
   */
  constructor(apiService, config = {}) {
    //     this.name                      this.config
    super('proofreader_plot_consistency', config);

    this.apiService = apiService;

    this.title = this.name.split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Execute the tool
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - Execution result
   */
  async execute(options) {
    console.log(`Executing ${this.title} with options:\n${options}`);
    
    let manuscriptFile = options.manuscript_file;
    const saveDir = options.save_dir || appState.CURRENT_PROJECT_PATH;
    
    if (!saveDir) {
      const errorMsg = 'Error: No save directory specified and no current project selected.\n' +
                      'Please select a project or specify a save directory.';
      this.emitOutput(errorMsg);
      throw new Error('No save directory available');
    }

    manuscriptFile = this.ensureAbsolutePath(manuscriptFile, saveDir);

    const outputFiles = [];
    let uploadedFileMetadata = null;
    let existingCache = null;
    
    try {
      const manuscriptContent = await this.readInputFile(manuscriptFile);
      const manuscriptWordCount = this.countWords(manuscriptContent);
      const manuscriptTokens = await this.apiService.countTokens(manuscriptContent);

      //                                          *******************
      const prepareResult = await this.apiService.prepareFileAndCache(manuscriptFile);
      prepareResult.messages.forEach(message => {
        this.emitOutput(`${message}\n`);
      });
      if (prepareResult.errors.length > 0) {
        this.emitOutput(`\n--- Errors encountered during preparation ---\n`);
        prepareResult.errors.forEach(error => {
          this.emitOutput(`ERROR: ${error}\n`);
        });
      }
      
      const prompt = this.createFullPrompt();
      const promptTokens = await this.apiService.countTokens(prompt);

      this.emitOutput(`Reading manuscript file: ${manuscriptFile}\n`);
      
      this.emitOutput(`\nSending request to AI API . . .\n`);
      this.emitOutput(`\n****************************************************************************\n`);
      this.emitOutput(`*  ${this.title} manuscript...\n`);
      this.emitOutput(`*  \n`);
      this.emitOutput(`*  This process typically takes several minutes.\n`);
      this.emitOutput(`*                                                                          \n`);
      this.emitOutput(`*  It's recommended to keep this window the sole 'focus'                   \n`);
      this.emitOutput(`*  and to avoid browsing online or running other apps, as these API        \n`);
      this.emitOutput(`*  network connections are often flakey, like delicate echoes of whispers. \n`);
      this.emitOutput(`*                                                                          \n`);
      this.emitOutput(`*  So breathe, remove eye glasses, stretch, relax, and be like water 🥋 🧘🏽‍♀️\n`);
      this.emitOutput(`*  \n`);
      this.emitOutput(`****************************************************************************\n\n`);
      
      const startTime = Date.now();
      let fullResponse = "";

      try {
        // console.dir(this.apiService);
        //                    ******************
        await this.apiService.streamWithThinking(
          prompt,
          (textDelta) => {
            fullResponse += textDelta;
            this.emitOutput(textDelta);
          }
        );
      } catch (error) {
        this.emitOutput(`\nAPI Error: ${error.message}\n`);
        throw error;
      }

      const elapsed = (Date.now() - startTime) / 1000;
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      
      this.emitOutput(`\nCompleted in: ⏰ ${minutes}m ${seconds.toFixed(2)}s.\n`);
      
      // Count words in response
      const wordCount = this.countWords(fullResponse);
      this.emitOutput(`Report has approximately ${wordCount} words.\n`);
      
      // Count tokens in response
      const responseTokens = await this.apiService.countTokens(fullResponse);
      this.emitOutput(`Response token count: ${responseTokens}\n`);

      const outputFile = await this.saveReport(
        fullResponse,
        promptTokens,
        responseTokens,
        saveDir
      );
      
      // Add the output files to the result
      outputFiles.push(...outputFile);
      
      // Add files to the cache
      outputFiles.forEach(file => {
        fileCache.addFile(this.name, file);
      });
      
      return {
        success: true,
        outputFiles
      };
    } catch (error) {
      console.error(`Error in ${this.title}:\n${error}`);
      this.emitOutput(`\nError: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Create prompt
   * @param {string} manuscriptContent - Manuscript content
   * @returns {string} - Prompt for Claude API
   */
  createFullPrompt() {
    const template = `You are a professional plot consistency proofreader focused on analyzing this manuscript:

CORE INSTRUCTION: Conduct a specialized review focusing EXCLUSIVELY on plot consistency issues. Thoroughly analyze story elements, important objects, character knowledge, fictional world rules, and narrative causality to identify contradictions, plot holes, or inconsistencies in how the story unfolds.

FOCUS ONLY ON:
- Fictional world rule contradictions (how magic, technology, or special abilities work)
- Plot causality issues (events happening without logical setup or connection)
- Knowledge inconsistencies (characters knowing things they shouldn't yet know or forgetting what they should know)
- Important object inconsistencies (items appearing, disappearing, or changing without explanation)
- Motivation inconsistencies (characters acting contrary to established goals without development)
- Narrative promises unfulfilled (setup without payoff, introduced elements that vanish)
- Factual contradictions within the story's established reality
- Information revealed to readers that conflicts with previous information

EXPLICITLY IGNORE:
- Spelling, grammar, punctuation, and formatting errors
- Character consistency issues (unless directly affecting plot)
- Timeline and chronology inconsistencies (unless directly affecting plot)
- Setting and location consistency issues (unless directly affecting plot)
- Stylistic choices and thematic elements
- Any other issues not directly related to plot and world-building consistency

APPROACH:
1. Track the story's internal logic and rules as you read through the manuscript
2. Monitor:
   - Important objects and their status/location
   - Information revealed to different characters and when
   - Rules established for how the world functions
   - Cause-and-effect relationships between events
   - Setup elements that promise later payoff
3. Identify contradictions, logical gaps, or inconsistencies in these elements
4. Present specific instances where plot elements appear inconsistent

PLOT ELEMENT TRACKING FORMAT:
For each significant plot element, create an entry with:
- Description of the element (object, knowledge, rule, etc.)
- When and how it's established in the narrative
- How it's used or referenced throughout the story
- Any changes or developments to the element

ISSUE REPORTING FORMAT:
For each plot inconsistency found:
- Number sequentially (e.g., "Plot Inconsistency #1")
- Show BOTH relevant text passages VERBATIM without adding quotation marks
- Explain the specific inconsistency
- Suggest a possible resolution if appropriate

EXAMPLE:
Plot Inconsistency #1:
First passage: The ancient amulet could only be destroyed in the fires where it was forged, deep within Mount Doom. No other force in the world could break it.
Second passage: With a mighty swing of his sword, Aragorn shattered the amulet into a thousand pieces, releasing its dark power into the wind.
Issue: The rules established for the amulet are contradictory. Initially, it's stated that the amulet can only be destroyed in a specific location (Mount Doom) and that no other force can break it. Later, a character destroys it with a conventional weapon without explanation.
Possible resolution: Either modify the initial rule about the amulet's invulnerability, explain how Aragorn's sword has special properties that allow it to break the rule, or revise the destruction scene to align with the established rules.

FINAL REPORT:
Provide a summary of key plot elements and established world rules, followed by all identified plot inconsistencies.

VERIFICATION:
At the end, confirm you checked ONLY for plot consistency issues and ignored all other types of issues as instructed.`;
    return template;
  }

  /**
   * Count words in text
   * @param {string} text - Text to count words in
   * @returns {number} - Word count
   */
  countWords(text) {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }
  
  /**
   * Ensure file path is absolute
   * @param {string} filePath - File path (may be relative or absolute)
   * @param {string} basePath - Base path to prepend for relative paths
   * @returns {string} - Absolute file path
   */
  ensureAbsolutePath(filePath, basePath) {
    if (!filePath) return filePath;
    
    // Check if the path is already absolute
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    
    // Make the path absolute by joining with the base path
    return path.join(basePath, filePath);
  }
  
  /**
   * Save report to file
   * @param {string} content - Response content
   * @param {number} promptTokens - Prompt token count
   * @param {number} responseTokens - Response token count
   * @param {string} saveDir - Directory to save to
   * @returns {Promise<string[]>} - Array of paths to saved files
   */
  async saveReport(
    content,
    promptTokens,
    responseTokens,
    saveDir
  ) {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      const dateTimeStr = formatter.format(new Date());
      const timestamp = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 15);
      const baseFilename = `${this.name.toLowerCase()}_${timestamp}`;
      
      // Array to collect all saved file paths
      const savedFilePaths = [];

      const reportWithStats = `=== ${this.title.toUpperCase()} REPORT ===
Date: ${dateTimeStr}
Prompt tokens: ${promptTokens}
Response tokens: ${responseTokens}

${content}`;
      
      // Save full response
      const reportFilename = `${baseFilename}.txt`;
      const reportPath = path.join(saveDir, reportFilename);
      await this.writeOutputFile(reportWithStats, saveDir, reportFilename);
      savedFilePaths.push(reportPath);
      this.emitOutput(`Report saved to: ${reportPath}\n`);
      return savedFilePaths;
    } catch (error) {
      console.error(`Error saving report:`, error);
      this.emitOutput(`Error saving report: ${error.message}\n`);
      throw error;
    }
  }
}

module.exports = ProofreaderPlotConsistency;
