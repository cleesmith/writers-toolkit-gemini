// client.js
const { GoogleGenAI, HarmCategory, HarmBlockThreshold } = require('@google/genai');

/**
 * AI API Service
 * Handles interactions with AI API services (currently Gemini)
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

    this.client = new GoogleGenAI({
      apiKey: apiKeyFromEnv
    });
  }

  async test() { 
    const response = await this.client.models.generateContentStream({
      model: this.config.model_name,
      contents: 'Write a 10-word poem.'
    });
    console.log(`\n\n>>>>> test`);
    for await (const chunk of response) { 
      console.log(chunk.text); 
    }; 
    console.log(`test <<<<\n\n`);
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
      // Set safety settings to OFF
      const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF }
      ];
      
      // Stream the response directly
      const streamGenerator = await this.client.models.generateContentStream({
        model: this.config.model_name,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        safetySettings: safetySettings
      });

      // Process each chunk
      for await (const chunk of streamGenerator) {
        console.log(JSON.stringify(chunk.candidates[0].content.parts[0], null, 2));
        console.log("Full chunk structure:"); // Label for the upcoming output
        console.dir(chunk, { depth: null });  // Display the complete object structure

        let currentText = chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!currentText) {
          continue;
        }
        
        // Send all text directly to the onText callback
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