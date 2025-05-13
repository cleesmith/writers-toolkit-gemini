// proofreader-spelling.js
const BaseTool = require('./base-tool');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs/promises');

/**
 * ProofreaderSpelling Tool
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
    this.cache = config.cache;
    // // later in code do defensive check each time you use the cache
    // if (this.cache && this.cache.get(key)) {
    //   // Safe to use cache
    // }
  }

  /**
   * Format remaining time until cache expiration
   * @param {string} expireTimeStr - The expiration time string from the API
   * @returns {string} - Human-readable remaining time
   */
  formatRemainingTime(expireTimeStr) {
    if (!expireTimeStr) return "unknown";
    
    const now = new Date();
    const expireTime = new Date(expireTimeStr);
    const remainingMs = expireTime.getTime() - now.getTime();
    
    if (remainingMs <= 0) return "expired";
    
    const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
    const remainingMinutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${remainingHours}h ${remainingMinutes}m`;
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
      
      // Step 1: Check for existing file uploads
      this.emitOutput(`\n--- Checking for existing file uploads ---\n`);
      
      if (this.apiService.client && this.apiService.client.files && 
          typeof this.apiService.client.files.list === 'function') {
        const fileListParams = {};
        try {
          const fileListResponsePager = await this.apiService.client.files.list(fileListParams);
          
          let fileCount = 0;
          for await (const file of fileListResponsePager) {
            fileCount++;
            this.emitOutput(`Found file #${fileCount}:\n`);
            this.emitOutput(`- Name: ${file.name}\n`);
            this.emitOutput(`- Display Name: ${file.displayName || 'N/A'}\n`);
            this.emitOutput(`- Size: ${file.sizeBytes || 'N/A'} bytes\n`);
            
            // Use the first active file found
            if (file.state === 'ACTIVE' && !uploadedFileMetadata) {
              this.emitOutput(`Using this file for proofreading.\n`);
              uploadedFileMetadata = file;
            }
          }
          
          if (fileCount === 0) {
            this.emitOutput(`No existing files found. Will upload manuscript.\n`);
          } else if (!uploadedFileMetadata) {
            this.emitOutput(`No ACTIVE files found. Will upload manuscript.\n`);
          }
        } catch (fileListError) {
          this.emitOutput(`Error listing files: ${fileListError.message}\n`);
          this.emitOutput(`Will proceed without file API.\n`);
        }
      } else {
        this.emitOutput(`Files API not available. Will proceed without file upload.\n`);
      }
      
      // Upload file if no existing file is found
      if (!uploadedFileMetadata && this.apiService.client && this.apiService.client.files && 
          typeof this.apiService.client.files.upload === 'function') {
        try {
          this.emitOutput(`Uploading manuscript file to API...\n`);
          uploadedFileMetadata = await this.apiService.client.files.upload({
            file: manuscriptFile,
            config: {
              mimeType: 'text/plain',
              displayName: `Manuscript: ${path.basename(manuscriptFile)}`
            }
          });
          this.emitOutput(`Successfully uploaded file: ${uploadedFileMetadata.name}\n`);
        } catch (uploadError) {
          this.emitOutput(`Error uploading file: ${uploadError.message}\n`);
          this.emitOutput(`Will proceed without file upload.\n`);
          uploadedFileMetadata = null;
        }
      }
      
      // Step 2: Check for existing caches
      this.emitOutput(`\n--- Checking for existing caches ---\n`);
      
      if (this.apiService.client && this.apiService.client.caches && 
          typeof this.apiService.client.caches.list === 'function') {
        const cacheListParams = { pageSize: 20 };
        try {
          const cacheListResponsePager = await this.apiService.client.caches.list(cacheListParams);
          
          let cacheCount = 0;
          let activeModelName = 'gemini-2.5-pro-preview-05-06'; // Default model name
          
          for await (const cache of cacheListResponsePager) {
            cacheCount++;
            const remainingTime = this.formatRemainingTime(cache.expireTime);
            this.emitOutput(`Found cache #${cacheCount}:\n`);
            this.emitOutput(`- Name: ${cache.name}\n`);
            this.emitOutput(`- Model: ${cache.model}\n`);
            this.emitOutput(`- Display Name: ${cache.displayName || 'N/A'}\n`);
            this.emitOutput(`- Expires: ${new Date(cache.expireTime).toLocaleString()} (Remaining: ${remainingTime})\n`);
            
            // Use the first non-expired cache found
            if (new Date(cache.expireTime) > new Date() && !existingCache) {
              this.emitOutput(`Using this cache for proofreading.\n`);
              existingCache = cache;
              activeModelName = cache.model;
            }
          }
          
          if (cacheCount === 0) {
            this.emitOutput(`No existing caches found. Will proceed without cache.\n`);
          } else if (!existingCache) {
            this.emitOutput(`All found caches are expired. Will proceed without cache.\n`);
          }
        } catch (cacheListError) {
          this.emitOutput(`Error listing caches: ${cacheListError.message}\n`);
          this.emitOutput(`Will proceed without cache API.\n`);
        }
      } else {
        this.emitOutput(`Caches API not available. Will proceed without cache.\n`);
      }
      
      // Create a cache if we have an uploaded file but no existing cache
      if (uploadedFileMetadata && !existingCache && 
          this.apiService.client && this.apiService.client.caches && 
          typeof this.apiService.client.caches.create === 'function') {
        try {
          this.emitOutput(`Creating new cache with uploaded file...\n`);
          
          // Create the base instructions for the cache
          const baseInstructions = `Your responses must be in PLAIN TEXT ONLY.
ABSOLUTELY DO NOT use any Markdown formatting (such as **, *, #, lists with -, etc.) in any part of your response.

You will analyze the creative fiction manuscript provided (which has been cached along with these base instructions) for the specific issues described in the user's follow-up prompt.
DO NOT include any introductory or concluding remarks (e.g., "Okay, here's the analysis...", "Overall, the manuscript is...").
DO NOT repeat any parts of the manuscript that are correct or do not have issues.`;

          // Create the cache with the file
          const { createPartFromUri, createUserContent } = this.apiService.client;
          
          const cacheConfig = {
            model: 'gemini-2.5-pro-preview-05-06',
            config: {
              contents: [createUserContent(createPartFromUri(uploadedFileMetadata.uri, uploadedFileMetadata.mimeType))],
              displayName: path.resolve(manuscriptFile),
              systemInstruction: baseInstructions,
              ttl: "14400s" // 4 hours in seconds
            }
          };
          
          existingCache = await this.apiService.client.caches.create(cacheConfig);
          this.emitOutput(`Successfully created cache: ${existingCache.name}\n`);
          this.emitOutput(`Cache expires: ${new Date(existingCache.expireTime).toLocaleString()}\n`);
        } catch (cacheCreateError) {
          this.emitOutput(`Error creating cache: ${cacheCreateError.message}\n`);
          this.emitOutput(`Will proceed without cache.\n`);
          existingCache = null;
        }
      }
      
      // Create the spelling prompt
      const spellingPrompt = this.createSpellingProofreadingPrompt(language);
      
      // Call API with streaming
      this.emitOutput(`\nSending request to AI API . . .\n`);

      // Add a message about waiting
      this.emitOutput(`****************************************************************************\n`);
      this.emitOutput(`*  Proofreading manuscript for ${language} spelling errors...              \n`);
      this.emitOutput(`*  \n`);
      this.emitOutput(`*  This process typically takes several minutes.                           \n`);
      this.emitOutput(`*  \n`);
      this.emitOutput(`****************************************************************************\n\n`);
      
      const startTime = Date.now();
      let fullResponse = "";
      
      try {
        // Prepare for API call
        if (uploadedFileMetadata && existingCache) {
          // If we have both file and cache, use them
          this.emitOutput(`Using cached file for API call...\n`);
          
          // Create a streamWithThinking call that uses the cache and file reference
          await this.apiService.streamWithThinking(
            spellingPrompt,
            (textDelta) => {
              fullResponse += textDelta;
              this.emitOutput(textDelta);
            },
            {
              cachedContent: existingCache.name
            }
          );
        } else if (uploadedFileMetadata) {
          // If we only have the file but no cache
          this.emitOutput(`Using uploaded file for API call (no cache)...\n`);
          
          // Need to create a prompt that references the file
          const { createPartFromUri } = this.apiService.client;
          const filePrompt = [
            {
              role: 'user',
              parts: [
                { text: spellingPrompt },
                createPartFromUri(uploadedFileMetadata.uri, uploadedFileMetadata.mimeType)
              ]
            }
          ];
          
          // Call the API with the file reference
          await this.apiService.streamWithContent(
            filePrompt,
            (textDelta) => {
              fullResponse += textDelta;
              this.emitOutput(textDelta);
            }
          );
        } else {
          // If we have neither file nor cache, use the standard approach
          this.emitOutput(`Using direct content for API call (no file or cache)...\n`);
          
          // Create the full prompt with manuscript content
          const fullPrompt = `=== MANUSCRIPT ===\n${manuscriptContent}\n=== END MANUSCRIPT ===\n\n${spellingPrompt}`;
          
          // Call the API with the full content
          await this.apiService.streamWithThinking(
            fullPrompt,
            (textDelta) => {
              fullResponse += textDelta;
              this.emitOutput(textDelta);
            }
          );
        }
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
      const promptTokens = await this.apiService.countTokens(spellingPrompt);
      this.emitOutput(`Response token count: ${responseTokens}\n`);

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
      const toolName = 'proofreader_spelling';
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
  createSpellingProofreadingPrompt(language = 'English') {
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