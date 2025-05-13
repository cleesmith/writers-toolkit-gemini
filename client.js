// client.js
const { GoogleGenAI, HarmCategory, HarmBlockThreshold } = require('@google/genai');

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

    // Assert that cache is available - fail early if missing
    if (!config.aiApiCache) {
      throw new Error('Requires AI Api Cache to be configured');
    }
    this.aiApiCache = config.aiApiCache;

    this.client = new GoogleGenAI({
      apiKey: apiKeyFromEnv
    });
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
      
      // const streamGenerator = await this.client.models.generateContentStream({
      //   model: this.config.model_name,
      //   contents: [{ role: "user", parts: [{ text: prompt }] }],
      //   safetySettings: safetySettings
      // });

      const responseStream = await ai.models.generateContentStream({
        model: modelName,
        contents: contentsForRequest,
        generationConfig: generationConfiguration,
        safetySettings: safetySettings,
        cachedContent: this.aiApiCache.name
      });

      for await (const chunk of streamGenerator) {
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


// THE FLOW
// As background info:
// 1. 
// code outside of the Tool did the following, which is 
// caching the uploaded file (manuscript+systemInstruction) 
// with a displayName = path.resolve of the manuscript file:
// const cacheConfig = {
//     model: modelName,
//     config: {
//         contents: [createUserContent(createPartFromUri(uploadedFileMetadata.uri, uploadedFileMetadata.mimeType))],
//         displayName: `${path.resolve(manuscriptFilePath)}`, // 128 bytes ?
//         systemInstruction: baseInstructionsFormat,
//         ttl: "14400s" // 4 hours in seconds - cache will auto-delete after this if not explicitly deleted
//     }
// };
// 2.
// createdCache is sent in config (maybe) during:
// constructor(apiService, config = {})
// ###


// Now in a nutshell (bare bones) this is what the Tool needs to do:
// const modelName = 'gemini-2.5-pro-preview-05-06';

// const generationConfiguration = {
//   responseMimeType: 'text/plain',
// };

// const safetySettings = [
//   { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF },
//   { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF },
//   { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF },
//   { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF },
// ];


// // The manuscript and base instructions are in the cache.
// // We only send the task-specific focus prompt.
// const contentsForRequest = [
//   {
//     role: 'user',
//     parts: [
//       { text: `FOCUS AREA: Spelling issues.\nFor the "Correction/Suggestion:" line, provide the directly corrected sentence.` },
//     ],
//   }
// ];

// // createdCache is passed to the Tool
// const responseStream = await ai.models.generateContentStream({
//   model: modelName,
//   contents: contentsForRequest,
//   generationConfig: generationConfiguration,
//   safetySettings: safetySettings,
//   cachedContent: createdCache.name, // reference the cache
// });

