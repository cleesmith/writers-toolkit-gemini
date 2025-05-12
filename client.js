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

    // this.test(); // ensure we can talk to api
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
   * Stream a response with thinking-like functionality
   * @param {string} prompt - Prompt to complete
   * @param {Object} options - API options (currently unused but kept for interface compatibility)
   * @param {Function} onThinking - Callback for thinking content
   * @param {Function} onText - Callback for response text
   * @returns {Promise<void>}
   */
  async streamWithThinking(prompt, options = {}, onThinking, onText) {
    if (!this.client || this.apiKeyMissing) {
      throw new Error('Gemini API client not initialized - API key missing');
    }

    try {
      const thinkingPrompt = `
${prompt}

IMPORTANT INSTRUCTION: First, think through this task step by step.
Begin your internal analysis by writing "THINKING:" followed by your detailed analysis.
After you've completed your analysis, write "RESPONSE:" followed by your final answer.
The THINKING section should be comprehensive, showing all your reasoning steps.
The RESPONSE section should only contain your final answer.
`;

      // Reverted to HarmBlockThreshold.OFF as per your original code and feedback
      const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF }
      ];
      
      const streamGenerator = await this.client.models.generateContentStream({
        model: this.config.model_name,
        contents: [{ role: "user", parts: [{ text: thinkingPrompt }] }],
        safetySettings: safetySettings
      });

      let inThinkingMode = false;
      let inResponseMode = false;
      
      for await (const chunk of streamGenerator) {
        let currentText = chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!currentText) {
          continue;
        }

        if (inThinkingMode) {
          const responseMarkerIndex = currentText.indexOf("RESPONSE:");
          if (responseMarkerIndex !== -1) {
            const thinkingPart = currentText.substring(0, responseMarkerIndex);
            if (thinkingPart) onThinking(thinkingPart);
            
            const responsePart = currentText.substring(responseMarkerIndex + "RESPONSE:".length);
            if (responsePart) onText(responsePart);
            
            inThinkingMode = false;
            inResponseMode = true;
          } else {
            onThinking(currentText);
          }
        } else if (inResponseMode) {
          onText(currentText);
        } else { 
          const thinkingMarkerIndex = currentText.indexOf("THINKING:");
          const responseMarkerIndex = currentText.indexOf("RESPONSE:");

          if (thinkingMarkerIndex !== -1 && (responseMarkerIndex === -1 || thinkingMarkerIndex < responseMarkerIndex)) {
            const preambleText = currentText.substring(0, thinkingMarkerIndex);
            if (preambleText) onText(preambleText);
            
            let postThinkingMarkerText = currentText.substring(thinkingMarkerIndex + "THINKING:".length);
            inThinkingMode = true;
            
            const nestedResponseMarkerIndex = postThinkingMarkerText.indexOf("RESPONSE:");
            if (nestedResponseMarkerIndex !== -1) {
              const thinkingPart = postThinkingMarkerText.substring(0, nestedResponseMarkerIndex);
              if (thinkingPart) onThinking(thinkingPart);
              
              const responsePart = postThinkingMarkerText.substring(nestedResponseMarkerIndex + "RESPONSE:".length);
              if (responsePart) onText(responsePart);
              
              inThinkingMode = false;
              inResponseMode = true;
            } else {
              if (postThinkingMarkerText) onThinking(postThinkingMarkerText);
            }
          } else if (responseMarkerIndex !== -1) {
            const preambleText = currentText.substring(0, responseMarkerIndex);
            if (preambleText) onText(preambleText);
            
            const responsePart = currentText.substring(responseMarkerIndex + "RESPONSE:".length);
            if (responsePart) onText(responsePart);
            
            inResponseMode = true;
          } else {
            onText(currentText);
          }
        }
      }
    } catch (error) {
      console.error('Error in Gemini streaming with thinking:', error);
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