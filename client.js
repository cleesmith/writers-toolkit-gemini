// client.js
const {
    GoogleGenAI,
    HarmCategory,
    HarmBlockThreshold,
    createUserContent,
    createPartFromUri,
} = require('@google/genai');

/**
 * AI API Service
 * Handles interactions with AI API services
 */
class AiApiService {
  /**
   * Constructor
   * @param {Object} config - API configuration
   */
  constructor(config = {}) {
    // Store the configuration with defaults
    this.config = {
      model_name: 'gemini-2.5-pro-preview-05-06', 
      ...config
    };

    const apiKeyFromEnv = process.env.GEMINI_API_KEY;
    if (!apiKeyFromEnv) {
      console.error('GEMINI_API_KEY environment variable not found');
      this.apiKeyMissing = true;
      return; 
    }

    // // Assert that cache is available - fail early if missing
    // if (!config.aiApiCache) {
    //   throw new Error('Requires AI Api Cache to be configured');
    // }
    this.aiApiCache = null;

    this.client = new GoogleGenAI({
      apiKey: apiKeyFromEnv
    });
  }

  /**
   * Prepares file upload and caching for manuscript processing
   * @param {string} manuscriptFile - Path to the manuscript file
   * @param {string} baseInstructions - Base system instructions for caching
   * @returns {Promise<Object>} - Returns {cache, messages, errors} where cache is the existing cache object
   */
  async prepareFileAndCache(manuscriptFile, baseInstructions) {
    if (!this.client || this.apiKeyMissing) {
      throw new Error('Gemini API client not initialized - API key missing');
    }

    const path = require('path');
    let uploadedFileMetadata = null;
    let existingCache = null;
    let activeModelName = this.config.model_name;
    
    // Create arrays to collect messages and errors
    const messages = [];
    const errors = [];
    
    // Log function for internal use
    const log = (message) => {
      messages.push(message);
      console.log(message); // Also log to console for debugging
    };
    
    // Error log function
    const logError = (message) => {
      errors.push(message);
      console.error(message); // Also log to console for debugging
    };

    // Step 1: Check for existing file uploads
    log(`\n--- Checking for existing file uploads ---`);
    
    if (this.client && this.client.files && 
        typeof this.client.files.list === 'function') {
      const fileListParams = {};
      try {
        const fileListResponsePager = await this.client.files.list(fileListParams);
        
        let fileCount = 0;
        for await (const file of fileListResponsePager) {
          fileCount++;
          log(`Found file #${fileCount}:`);
          log(`- Name: ${file.name}`);
          log(`- Display Name: ${file.displayName || 'N/A'}`);
          log(`- Size: ${file.sizeBytes || 'N/A'} bytes`);
          
          // Use the first active file found
          if (file.state === 'ACTIVE' && !uploadedFileMetadata) {
            log(`Using this file for processing.`);
            uploadedFileMetadata = file;
          }
        }
        
        if (fileCount === 0) {
          log(`No existing files found. Will upload manuscript.`);
        } else if (!uploadedFileMetadata) {
          log(`No ACTIVE files found. Will upload manuscript.`);
        }
      } catch (fileListError) {
        logError(`Error listing files: ${fileListError.message}`);
        log(`Will proceed without file API.`);
      }
    } else {
      log(`Files API not available. Will proceed without file upload.`);
    }
    
    // Upload file if no existing file is found
    if (!uploadedFileMetadata && this.client && this.client.files && 
        typeof this.client.files.upload === 'function') {
      try {
        log(`Uploading manuscript file to API...`);
        uploadedFileMetadata = await this.client.files.upload({
          file: manuscriptFile,
          config: {
            mimeType: 'text/plain',
            displayName: `Manuscript: ${path.basename(manuscriptFile)}`
          }
        });
        log(`Successfully uploaded file: ${uploadedFileMetadata.name}`);
      } catch (uploadError) {
        logError(`Error uploading file: ${uploadError.message}`);
        log(`Will proceed without file upload.`);
        uploadedFileMetadata = null;
      }
    }
    
    // Step 2: Check for existing caches
    log(`\n--- Checking for existing caches ---`);
    
    if (this.client && this.client.caches && 
        typeof this.client.caches.list === 'function') {
      const cacheListParams = { pageSize: 20 };
      try {
        const cacheListResponsePager = await this.client.caches.list(cacheListParams);
        
        let cacheCount = 0;
        
        for await (const cache of cacheListResponsePager) {
          cacheCount++;
          // Use formatRemainingTime if available, otherwise calculate directly
          let remainingTime = "unknown";
          if (typeof this.formatRemainingTime === 'function') {
            remainingTime = this.formatRemainingTime(cache.expireTime);
          } else if (cache.expireTime) {
            const now = new Date();
            const expireTime = new Date(cache.expireTime);
            const remainingMs = expireTime.getTime() - now.getTime();
            
            if (remainingMs <= 0) {
              remainingTime = "expired";
            } else {
              const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
              const remainingMinutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
              remainingTime = `${remainingHours}h ${remainingMinutes}m`;
            }
          }
          
          log(`Found cache #${cacheCount}:`);
          log(`- Name: ${cache.name}`);
          log(`- Model: ${cache.model}`);
          log(`- Display Name: ${cache.displayName || 'N/A'}`);
          log(`- Expires: ${new Date(cache.expireTime).toLocaleString()} (Remaining: ${remainingTime})`);
          
          // Use the first non-expired cache found
          if (new Date(cache.expireTime) > new Date() && !existingCache) {
            log(`Using this cache for processing.`);
            existingCache = cache;
            activeModelName = cache.model;
          }
        }
        
        if (cacheCount === 0) {
          log(`No existing caches found. Will proceed without cache.`);
        } else if (!existingCache) {
          log(`All found caches are expired. Will proceed without cache.`);
        }
      } catch (cacheListError) {
        logError(`Error listing caches: ${cacheListError.message}`);
        log(`Will proceed without cache API.`);
      }
    } else {
      log(`Caches API not available. Will proceed without cache.`);
    }
    
    // Create a cache if we have an uploaded file but no existing cache
    if (uploadedFileMetadata && !existingCache && 
        this.client && this.client.caches && 
        typeof this.client.caches.create === 'function') {
      try {
        log(`Creating new cache with uploaded file...`);
        
        // Use the base instructions provided or a default
        const instructions = baseInstructions || `You will analyze the creative fiction manuscript provided (which has been cached along with these base instructions) for the specific issues described in the user's follow-up prompt.
DO NOT include any introductory or concluding remarks (e.g., "Okay, here's the analysis...", "Overall, the manuscript is...").
DO NOT repeat any parts of the manuscript that are correct or do not have issues.`;

        // Create the cache with the file
        // const { createPartFromUri, createUserContent } = this.client;
        
        // Set default TTL if not provided
        const ttl = this.ttl || "14400s"; // 4 hours default if not specified
        
        const cacheConfig = {
          model: this.config.model_name,
          config: {
            contents: [createUserContent(createPartFromUri(uploadedFileMetadata.uri, uploadedFileMetadata.mimeType))],
            displayName: path.resolve(manuscriptFile),
            systemInstruction: instructions,
            ttl: ttl
          }
        };
        
        existingCache = await this.client.caches.create(cacheConfig);
        log(`Successfully created cache: ${existingCache.name}`);
        log(`Cache expires: ${new Date(existingCache.expireTime).toLocaleString()}`);
      } catch (cacheCreateError) {
        logError(`Error creating cache: ${cacheCreateError.message}`);
        log(`Will proceed without cache.`);
        existingCache = null;
      }
    }
    
    this.aiApiCache = existingCache;

    // Return both the cache and collected messages/errors
    return {
      cache: existingCache,
      messages,
      errors
    };
  }

  /**
   * Stream a response
   * @param {string} prompt - Prompt to complete
   * @param {Function} onText - Callback for response text
   * @returns {Promise<void>}
   */
  async streamWithThinking(prompt, onText) {
    if (!this.client || this.apiKeyMissing) {
      throw new Error('Gemini API client not initialized - API key missing');
    }

    try {
      const generationConfiguration = {
        responseMimeType: 'text/plain',
      };

      const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF }
      ];

      const contentsForRequest = [
        {
          role: 'user',
          parts: [
            { text: prompt },
          ],
        }
      ];

      const responseStream = await this.client.models.generateContentStream({
        model: this.config.model_name,
        contents: contentsForRequest,
        generationConfig: generationConfiguration,
        safetySettings: safetySettings,
        cachedContent: this.aiApiCache.name
      });

      for await (const chunk of responseStream) {
        console.log(JSON.stringify(chunk.candidates[0].content.parts[0], null, 2));
        console.log("Full chunk structure:"); // Label for the upcoming output
        console.dir(chunk, { depth: null });  // Display the complete object structure

        let currentText = chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!currentText) {
          continue;
        }
        
        onText(currentText);
      }
    } catch (error) {
      console.error('API Connection Error:', {
        message: error.message,
        status: error.status,
        statusText: error.statusText,
        url: error.url,
        type: error.type,
        response: error.response ? {
          status: error.response.status,
          statusText: error.response.statusText
        } : 'No response'
      });
      throw error;
    }
  }

  /**
   * Count tokens in a text string
   * @param {string} text - Text to count tokens in
   * @returns {Promise<number>} - Token count (returns 0 on error)
   */
  async countTokens(text) {
    try {
      const result = await this.client.models.countTokens({
        model: this.config.model_name,
        contents: [{ role: "user", parts: [{ text: text }] }] 
      });
      
      return result.totalTokens;
    } catch (error) {
      console.error('Token counting error:', error);
      return 0;
    }
  }
}

module.exports = AiApiService;
