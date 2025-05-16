// proofreader-spelling.js
const BaseTool = require('./base-tool');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs/promises');

/**
 * Proofreader Spelling Tool
 * Analyzes manuscript specifically for spelling issues, focusing on word-by-word analysis while
 * being sensitive to intentional stylistic choices like dialogue and character voice.
 * Utilizes Gemini's file and cache systems for efficient processing of large manuscripts.
 */
class ProofreaderSpelling extends BaseTool {
  /**
   * Constructor
   * @param {Object} apiService - AI API service
   * @param {Object} config - Tool configuration
   */
  constructor(apiService, config = {}) {
    super('proofreader_spelling', config);
    this.apiService = apiService;
  }

  /**
   * Execute the tool
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - Execution result
   */
  async execute(options) {
    console.log('Executing Proofreader (Spelling) with options:', options);
    
    // Extract options
    let manuscriptFile = options.manuscript_file;
    const language = options.language || 'English';
    const saveDir = options.save_dir || appState.CURRENT_PROJECT_PATH;
    
    if (!saveDir) {
      const errorMsg = 'Error: No save directory specified and no current project selected.\n' +
                      'Please select a project or specify a save directory.';
      this.emitOutput(errorMsg);
      throw new Error('No save directory available');
    }

    // Ensure file paths are absolute
    manuscriptFile = this.ensureAbsolutePath(manuscriptFile, saveDir);

    const outputFiles = [];
    let uploadedFileMetadata = null;
    let existingCache = null;
    
    try {
      // Read the manuscript file content (local copy for reference)
      const manuscriptContent = await this.readInputFile(manuscriptFile);
      const manuscriptWordCount = this.countWords(manuscriptContent);
      const manuscriptTokens = await this.apiService.countTokens(manuscriptContent);
      
      this.emitOutput(`Reading manuscript file: ${manuscriptFile}\n`);
      this.emitOutput(`Manuscript is ${manuscriptWordCount} words and ${manuscriptTokens} tokens.\n`);

      //                                          *******************
      const prepareResult = await this.apiService.prepareFileAndCache(manuscriptFile);

      // Output all the messages collected during File/Cache prep
      prepareResult.messages.forEach(message => {
        this.emitOutput(`${message}\n`);
      });
      if (prepareResult.errors.length > 0) {
        this.emitOutput(`\n--- Errors encountered during preparation ---\n`);
        prepareResult.errors.forEach(error => {
          this.emitOutput(`ERROR: ${error}\n`);
        });
      }

      const prompt = this.createFullPrompt(language);
      
      this.emitOutput(`\nSending request to AI API . . .\n`);
      this.emitOutput(`****************************************************************************\n`);
      this.emitOutput(`*  Proofreading manuscript for ${language} spelling errors...              \n`);
      this.emitOutput(`*  \n`);
      this.emitOutput(`*  This process typically takes several minutes.                           \n`);
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
        console.dir(this.apiService);
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
      const promptTokens = await this.apiService.countTokens(prompt);
      this.emitOutput(`Response token count: ${responseTokens}\n`);

      const outputFile = await this.saveReport(
        language,
        fullResponse,
        promptTokens,
        responseTokens,
        saveDir
      );
      
      // Add all output files to the result
      outputFiles.push(...outputFile);
      
      // Add files to the cache
      outputFiles.forEach(file => {
        fileCache.addFile(this.name, file);
      });
      
      // Return the result
      return {
        success: true,
        outputFiles,
        stats: {
          wordCount,
          tokenCount: responseTokens,
          elapsedTime: `${minutes}m ${seconds.toFixed(2)}s`,
          language
        }
      };
    } catch (error) {
      console.error('Error in ProofreaderSpelling:', error);
      this.emitOutput(`\nError: ${error.message}\n`);
      throw error;
    } finally {
      // Cleanup if needed - could add file/cache deletion here if temporary
    }
  }
  
  /**
   * Create spelling proofreading prompt
   * @param {string} language - Language of the manuscript
   * @returns {string} - Prompt for AI API
   */
  createFullPrompt(language = 'English') {
    // Create a specialized prompt for spelling checks - without including the manuscript content
    // This is suitable for use with uploaded files and caches
    return `Perform a comprehensive word-by-word spelling check on the entire document while being sensitive to intentional stylistic choices.

Your task:
1. Examine EVERY single word in sequence, comparing each against standard ${language} spelling
2. Specifically flag ALL instances of:
   - Misspelled words (e.g., 'teh' instead of 'the')
   - Missing apostrophes in contractions (e.g., 'dont' instead of 'don't')
   - Incorrect homophone usage (e.g., 'their' when 'there' is needed)
   - Common pattern errors (dropping double letters, 'ie' vs 'ei' errors)

3. DISTINGUISH between true spelling errors and intentional stylistic choices by considering:
   - Is the word in dialogue or a character's thoughts?
   - Does it reflect a character's established speech pattern or education level?
   - Is it consistent with the character's voice throughout the story?
   - Is it a recognized colloquialism, slang term, or regional dialect?
   - Does it appear to be an intentional creative choice?

Format your response differently based on the type of issue:

FOR GENUINE SPELLING ERRORS:
---------
Original: [The passage containing the error]
Issue(s): Spelling - [Describe the specific error]
Correction/Suggestion: [The corrected passage]

FOR POSSIBLE STYLISTIC CHOICES:
---------
Original: [The passage containing the non-standard usage]
Note: This appears to be intentional non-standard language that might reflect [character voice/dialect/colloquial speech/etc.]. While not standard ${language}, this may be a stylistic choice rather than an error.
Consider: [Brief note on whether this is consistent with the character's established voice or if it might be an unintentional error]

Examples of stylistic choices that should NOT be marked as errors (unless inconsistent with the character):
- Non-standard words used in dialogue ("ain't", "gonna", "wanna")
- Child-like speech ("bestest", "funnest")
- Dialectal spellings showing accent ("fer" for "for", "ya" for "you")
- Character-specific speech patterns (dropped g's like "talkin'", simplified words)
- Established slang or colloquialisms

When in doubt about whether something is an error or stylistic choice:
1. Check if it's consistent with how the character speaks/thinks elsewhere
2. Note it as a possible stylistic choice rather than definitively marking it as an error
3. Suggest the standard spelling but indicate it may be intentional

For the "Correction/Suggestion:" line, provide the directly corrected sentence.`;
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
   * @param {string} language - Language of the manuscript
   * @param {string} content - Response content
   * @param {number} promptTokens - Prompt token count
   * @param {number} responseTokens - Response token count
   * @param {string} saveDir - Directory to save to
   * @returns {Promise<string[]>} - Array of paths to saved files
   */
  async saveReport(
    language,
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

      // Create timestamp for filename
      const timestamp = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 15);
      
      // Create descriptive filename
      const baseFilename = `spelling_check_${language.toLowerCase()}_${timestamp}`;
      
      // Array to collect all saved file paths
      const savedFilePaths = [];
      
      // Add stats to the top of the report
      const reportWithStats = `=== SPELLING CHECK REPORT (${language}) ===
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

module.exports = ProofreaderSpelling;