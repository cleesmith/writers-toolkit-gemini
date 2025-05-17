// punctuation-auditor.js
const BaseTool = require('./base-tool');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs/promises');

/**
 * Punctuation Auditor Tool
 * Analyzes manuscript for punctuation effectiveness using the Claude API.
 * Identifies issues like run-on sentences, missing commas, and odd punctuation patterns
 * that might hinder clarity and flow, following Ursula K. Le Guin's writing principles.
 */
class PunctuationAuditor extends BaseTool {
  /**
   * Constructor
   * @param {Object} apiService - AI API service
   * @param {Object} config - Tool configuration
   */
  constructor(apiService, config = {}) {
    super('punctuation_auditor', config);
    this.apiService = apiService;
  }

  /**
   * Execute the tool
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - Execution result
   */
  async execute(options) {
    console.log('Executing Punctuation Auditor with options:', options);
    
    // Extract options
    let manuscriptFile = options.manuscript_file;
    const saveDir = options.save_dir || appState.CURRENT_PROJECT_PATH;
    
    if (!saveDir) {
      const errorMsg = 'Error: No save directory specified and no current project selected.\n' +
                      'Please select a project or specify a save directory.';
      this.emitOutput(errorMsg);
      throw new Error('No save directory available');
    }

    // Ensure file paths are absolute
    manuscriptFile = this.ensureAbsolutePath(manuscriptFile, saveDir);
    
    // Log the full paths for debugging
    console.log('Using full paths:');
    console.log(`Manuscript: ${manuscriptFile}`);

    const outputFiles = [];
    
    try {
      const manuscriptContent = await this.readInputFile(manuscriptFile);
      const manuscriptWordCount = this.countWords(manuscriptContent);
      const manuscriptTokens = await this.apiService.countTokens(manuscriptContent);

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

      const prompt = this.createFullPrompt(manuscriptContent);
      const promptTokens = await this.apiService.countTokens(prompt);

      this.emitOutput(`>>> Sending request to Claude API (streaming)...\n`);

      this.emitOutput(`****************************************************************************\n`);
      this.emitOutput(`*  Analyzing punctuation effectiveness in your manuscript...               \n`);
      this.emitOutput(`*  This process typically takes several minutes.                           \n`);
      this.emitOutput(`*\n`);
      this.emitOutput(`*  It's recommended to keep this window the sole 'focus'                   \n`);
      this.emitOutput(`*  and to avoid browsing online or running other apps, as these API        \n`);
      this.emitOutput(`*  network connections are often flakey, like delicate echoes of whispers. \n`);
      this.emitOutput(`*\n`);
      this.emitOutput(`*  So breathe, remove eye glasses, stretch, relax, and be like water 🥋 🧘🏽‍♀️\n`);
      this.emitOutput(`****************************************************************************\n\n`);
      
      const startTime = Date.now();
      let fullResponse = "";
      let thinkingContent = "";

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
      
      this.emitOutput(`\nCompleted in ${minutes}m ${seconds.toFixed(2)}s.\n`);
      
      // Count words in response
      const wordCount = this.countWords(fullResponse);
      this.emitOutput(`Report has approximately ${wordCount} words.\n`);
      
      // Count tokens in response
      const responseTokens = await this.apiService.countTokens(fullResponse);
      this.emitOutput(`Response token count: ${responseTokens}\n`);

      // Save the report
      const outputFile = await this.saveReport(
        fullResponse,
        promptTokens,
        responseTokens,
        saveDir
      );
      
      // Add all output files to the result
      outputFiles.push(...outputFile);
      
      // Add files to the cache
      const toolName = 'punctuation_auditor';
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
          elapsedTime: `${minutes}m ${seconds.toFixed(2)}s`
        }
      };
    } catch (error) {
      console.error('Error in Punctuation Auditor:', error);
      this.emitOutput(`\nError: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Create punctuation analysis prompt
   * @param {string} manuscriptContent - Manuscript content
   * @returns {string} - Prompt for Claude API
   */
  createFullPrompt(manuscriptContent) {
    const template = `You are an expert literary editor specializing in punctuation and its impact on prose clarity and flow. Your task is to analyze the provided manuscript for punctuation effectiveness.

Follow Ursula K. Le Guin's principle from "Steering the Craft" that punctuation should guide how the text "sounds" to a reader. Analyze how punctuation either supports or hinders the clarity, rhythm, and natural flow of the prose.

Pay special attention to:
1. Overly long sentences that lack adequate punctuation (run-ons)
2. Missing commas that would clarify meaning or improve readability
3. Unusual or inconsistent punctuation patterns
4. Places where reading aloud would reveal awkward punctuation
5. Sentences where alternative punctuation would improve flow or clarity

For each issue you identify, provide:
- The original passage
- What makes the punctuation problematic
- A specific recommendation for improvement

Create a comprehensive punctuation analysis with these sections:
1. PUNCTUATION OVERVIEW:
   - Analyze overall patterns of punctuation usage in the manuscript
   - Identify common punctuation habits
   - Note any immediate issues with basic punctuation (missing periods, etc.)

2. RUN-ON SENTENCE IDENTIFICATION:
   - Identify overly long sentences with inadequate punctuation
   - Flag sentences that may cause confusion due to length or structure
   - Suggest natural breaking points and punctuation improvements

3. COMMA USAGE ANALYSIS:
   - Highlight missing commas in compound sentences
   - Identify comma splices (two complete sentences joined only by a comma)
   - Point out necessary commas missing after introductory phrases
   - Note any patterns of comma overuse

4. SPECIALIZED PUNCTUATION ANALYSIS:
   - Evaluate semicolon and colon usage for correctness and effectiveness
   - Assess dash usage (em dashes, en dashes, hyphens) for consistency and clarity
   - Review parenthetical expressions and their impact on readability
   - Examine quotation mark and dialogue punctuation conventions

5. READABILITY IMPACT ASSESSMENT:
   - Analyze how punctuation patterns affect the flow and rhythm of sentences
   - Identify passages where punctuation hinders natural reading cadence
   - Suggest punctuation changes to improve overall readability
   - Note patterns where punctuation style might be adjusted to match content

6. SENTENCE STRUCTURE AND PUNCTUATION:
   - Analyze how punctuation interacts with sentence structure
   - Identify complex sentences that might benefit from restructuring
   - Suggest alternative punctuation strategies for particularly challenging passages
   - Examine nested clauses and their punctuation

7. DIALOGUE AND QUOTATION ANALYSIS:
   - Review dialogue punctuation conventions and consistency
   - Assess quotation mark usage, including nested quotations
   - Examine speaker attribution and its punctuation
   - Suggest improvements for unclear dialogue punctuation

8. ADVANCED PUNCTUATION STRATEGIES:
   - Recommend stylistic punctuation techniques from master prose writers
   - Suggest intentional punctuation variations to create emphasis or effect
   - Analyze how punctuation might be used to establish or enhance voice
   - Provide examples of innovative punctuation approaches that maintain clarity

Perform a detailed analysis of punctuation usage, noting even minor or stylistic issues.

Format your analysis as a clear, organized report with sections and subsections. Use plain text formatting only (NO Markdown). Use numbered or bulleted lists where appropriate for clarity.

Be specific in your examples and suggestions, showing how punctuation can be improved without changing the author's voice or intention. Focus on practical changes that will make the writing more readable and effective.
`;

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
   * Save report and thinking content to files
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

      // Create timestamp for filename
      const timestamp = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 15);
      
      // Create descriptive filename
      const baseFilename = `punctuation_auditor_${timestamp}`;
      
      // Array to collect all saved file paths
      const savedFilePaths = [];

      const reportWithStats = `=== PUNCTUATION REPORT ===
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

module.exports = PunctuationAuditor;
