// proofreader-mechanical.js
const BaseTool = require('./tool-base');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs/promises');

/**
 * ProofreaderMechanical Tool
 * Analyzes manuscript specifically for mechanical errors (spelling, grammar, punctuation, formatting)
 * without checking for any consistency issues. Designed to work efficiently with large manuscripts.
 */
class ProofreaderMechanical extends BaseTool {
  /**
   * Constructor
   * @param {Object} apiService - AI API service
   * @param {Object} config - Tool configuration
   */
  constructor(apiService, config = {}) {
    super('proofreader_mechanical', config);
    this.apiService = apiService;
  }

  /**
   * Execute the tool
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - Execution result
   */
  async execute(options) {
    console.log('Executing Proofreader (Mechanical) with options:', options);
    
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
    
    try {
      const manuscriptContent = await this.readInputFile(manuscriptFile);
      const manuscriptWordCount = this.countWords(manuscriptContent);
      const manuscriptTokens = await this.apiService.countTokens(manuscriptContent);
      
      const prompt = this.createMechanicalProofreadingPrompt(manuscriptContent, language);

      const promptTokens = await this.apiService.countTokens(prompt);

      this.emitOutput(`Reading manuscript file: ${manuscriptFile}\n`);
      this.emitOutput(`Manuscript is ${manuscriptWordCount} words and ${manuscriptTokens} tokens.\n`);
      
      // Call API with streaming
      this.emitOutput(`Sending request to AI API . . .\n`);

      // Add a message about waiting
      this.emitOutput(`****************************************************************************\n`);
      this.emitOutput(`*  Proofreading manuscript for ${language} mechanical errors...\n`);
      this.emitOutput(`*  \n`);
      this.emitOutput(`*  This process typically takes several minutes.                           \n`);
      this.emitOutput(`*  \n`);
      this.emitOutput(`****************************************************************************\n\n`);
      
      const startTime = Date.now();
      let fullResponse = "";
      
      try {
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

      // Remove any markdown formatting
      fullResponse = this.removeMarkdown(fullResponse);

      // Save the report
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
      const toolName = 'proofreader_mechanical';
      outputFiles.forEach(file => {
        fileCache.addFile(toolName, file);
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
      console.error('Error in ProofreaderMechanical:', error);
      this.emitOutput(`\nError: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Create mechanical proofreading prompt
   * @param {string} manuscriptContent - Manuscript content
   * @param {string} language - Language of the manuscript
   * @returns {string} - Prompt for AI API
   */
  createMechanicalProofreadingPrompt(manuscriptContent, language = 'English') {
    // Create a focused, plain language prompt that avoids complexity
    const instructions = `Review this manuscript for mechanical errors ONLY. Ignore all other types of issues.

Focus exclusively on identifying spelling errors, grammar problems, punctuation mistakes, and basic formatting issues. Do not concern yourself with any aspects of consistency across the manuscript. This means you should not track or check character details, timeline elements, setting descriptions, or plot logic. Your task is simply to identify technical writing errors at the sentence level.

For each error you find:
1. Show the verbatim sentence containing the error WITHOUT adding quotation marks
2. Identify the specific error
3. Provide a correction

Read through the manuscript naturally without creating any tracking systems. Simply note errors as you encounter them. Give equal attention to the entire manuscript from beginning to end.

At the end, briefly confirm that you focused only on mechanical errors.`;

    // Combine manuscript and instructions
    return `=== MANUSCRIPT ===\n${manuscriptContent}\n=== END MANUSCRIPT ===\n\n${instructions}`;
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
   * Remove any markdown formatting from the text
   * @param {string} text - Text that might contain markdown
   * @returns {string} - Text with markdown formatting removed
   */
  removeMarkdown(text) {
    // Remove header formatting
    text = text.replace(/^#+\s+/gm, '');
    
    // Remove bullet points
    text = text.replace(/^[*-]\s+/gm, '');
    
    // Remove numbered lists (convert "1. " to just "1. ")
    text = text.replace(/^\d+\.\s+/gm, match => match);
    
    // Remove bold/italic formatting
    text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
    text = text.replace(/(\*|_)(.*?)\1/g, '$2');
    
    // Remove code blocks and inline code
    text = text.replace(/```[\s\S]*?```/g, match => {
      // Preserve the content inside code blocks
      return match.replace(/```\w*\n|```$/g, '');
    });
    text = text.replace(/`([^`]+)`/g, '$1');
    
    return text;
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
      const baseFilename = `proofreading_${language.toLowerCase()}_${timestamp}`;
      
      // Array to collect all saved file paths
      const savedFilePaths = [];
      
      // Add stats to the top of the report
      const reportWithStats = `=== PROOFREADING REPORT (${language}) ===
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

module.exports = ProofreaderMechanical;