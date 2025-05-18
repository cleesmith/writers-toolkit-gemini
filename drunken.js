// drunk-claude.js
const ToolBase = require('./tool-base');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs/promises');

/**
 * Drunken AI Tool
 * Reads a manuscript file and gives a brutally honest critique.
 */
class Drunken extends ToolBase {
  /**
   * Constructor
   * @param {Object} apiService - AI API service
   * @param {Object} config - Tool configuration
   */
  constructor(apiService, config = {}) {
    super('drunken', config);

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
  // async execute(options) {
  //   console.log(`Executing ${this.title} with options:\n${options}`);
    
  //   let manuscriptFile = options.manuscript_file;
  //   const saveDir = options.save_dir || appState.CURRENT_PROJECT_PATH;
    
  //   if (!saveDir) {
  //     const errorMsg = 'Error: No save directory specified and no current project selected.\n' +
  //                     'Please select a project or specify a save directory.';
  //     this.emitOutput(errorMsg);
  //     throw new Error('No save directory available');
  //   }

  //   manuscriptFile = this.ensureAbsolutePath(manuscriptFile, saveDir);

  //   const outputFiles = [];
    
  //   try {
  //     this.emitOutput(`Reading manuscript file: ${manuscriptFile}\n`);
  //     const manuscriptContent = await this.readInputFile(manuscriptFile);
        
  //     const prompt = this.createPrompt(manuscriptContent);

  //     // Count tokens in the prompt
  //     this.emitOutput(`Counting tokens in prompt...\n`);
  //     const promptTokens = await this.GeminiAPIService.countTokens(prompt);
      
  //     // Call Claude API with streaming
  //     this.emitOutput(`Sending request to Claude API (streaming)...\n`);
      
  //     // Add a message about waiting
  //     this.emitOutput(`****************************************************************************\n`);
  //     this.emitOutput(`*  Drunk Claude critique your manuscript...                                \n`);
  //     this.emitOutput(`*  This process typically takes several minutes.                           \n`);
  //     this.emitOutput(`*                                                                          \n`);
  //     this.emitOutput(`*  It's recommended to keep this window the sole 'focus'                   \n`);
  //     this.emitOutput(`*  and to avoid browsing online or running other apps, as these API        \n`);
  //     this.emitOutput(`*  network connections are often flakey, like delicate echoes of whispers. \n`);
  //     this.emitOutput(`*                                                                          \n`);
  //     this.emitOutput(`*  So breathe, remove eye glasses, stretch, relax, and be like water 🥋 🧘🏽‍♀️\n`);
  //     this.emitOutput(`****************************************************************************\n\n`);
      
  //     const startTime = Date.now();
  //     let fullResponse = "";
  //     let thinkingContent = "";

  //     try {
  //       await this.GeminiAPIService.streamWithThinking(
  //         prompt,
  //         {
  //           system: systemPrompt,
  //           max_tokens: tokenBudgets.maxTokens,
  //           thinking: {
  //             type: "enabled",
  //             budget_tokens: tokenBudgets.thinkingBudget
  //           }
  //         },
  //         // Callback for thinking content
  //         (thinkingDelta) => {
  //           thinkingContent += thinkingDelta;
  //         },
  //         // Callback for response text
  //         (textDelta) => {
  //           fullResponse += textDelta;
  //         }
  //       );
  //     } catch (error) {
  //       this.emitOutput(`\nAPI Error: ${error.message}\n`);
  //       throw error;
  //     }

  //     const elapsed = (Date.now() - startTime) / 1000;
  //     const minutes = Math.floor(elapsed / 60);
  //     const seconds = elapsed % 60;
      
  //     this.emitOutput(`\nCompleted in ${minutes}m ${seconds.toFixed(2)}s.\n`);
      
  //     // Count words in response
  //     const wordCount = this.countWords(fullResponse);
  //     this.emitOutput(`Report has approximately ${wordCount} words.\n`);
      
  //     // Count tokens in response
  //     const responseTokens = await this.GeminiAPIService.countTokens(fullResponse);
  //     this.emitOutput(`Response token count: ${responseTokens}\n`);

  //     const outputFile = await this.saveReport(
  //       fullResponse,
  //       promptTokens,
  //       responseTokens,
  //       saveDir
  //     );
      
  //     // Add the output files to the result
  //     outputFiles.push(...outputFile);
      
  //     // Add files to the cache
  //     const toolName = 'drunken';
  //     outputFiles.forEach(file => {
  //       fileCache.addFile(toolName, file);
  //     });
      
  //     return {
  //       success: true,
  //       outputFiles
  //     };
  //   } catch (error) {
  //     console.error(`Error in ${this.title}:\n${error}`);
  //     this.emitOutput(`\nError: ${error.message}\n`);
  //     throw error;
  //   }
  // }

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
   * @returns {string} - prompt
   */
  createFullPrompt() {
    return `Let's pretend you are a very drunk AI, a bard at a local author/writer's pub, and 
you're working on your second bottle of really good wine. 
So you are very loose and very honest, more so than usual.

As a retired college professor of fiction writing you always were 
brutally honest about student manuscripts and book critiques.
Lay it on me, us writer's can handle it.

Use specific text examples from the manuscript to support your critique.`;
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

      const reportWithStats = `=== ${this.title.toUpperCase()} TOOL REPORT ===
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

module.exports = Drunken;
