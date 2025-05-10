// client.js - Gemini API Service
const { GoogleGenAI, HarmCategory, HarmBlockThreshold } = require('@google/genai');

/**
 * Gemini API Service
 * Handles interactions with the Gemini AI API
 * Compatible with the Claude API interface
 */
class GeminiAPIService {
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

    // Check for API key
    const apiKeyFromEnv = process.env.GEMINI_API_KEY;
    if (!apiKeyFromEnv) {
      console.error('GEMINI_API_KEY environment variable not found');
      this.apiKeyMissing = true;
      return; // don't create the client but don't crash
    }

    // Initialize the client with proper configuration object
    this.client = new GoogleGenAI({
      apiKey: apiKeyFromEnv,
      httpOptions: {
        timeout: 900000 // 15 minutes in milliseconds
      }
    });
  }

  /**
   * Stream a response with thinking-like functionality
   * @param {string} prompt - Prompt to complete
   * @param {Object} options - API options
   * @param {Function} onThinking - Callback for thinking content
   * @param {Function} onText - Callback for response text
   * @returns {Promise<void>}
   */
  async streamWithThinking(prompt, options = {}, onThinking, onText) {
    if (!this.client || this.apiKeyMissing) {
      throw new Error('Gemini API client not initialized - API key missing');
    }

    try {
      // Add thinking instructions to the prompt
      const thinkingPrompt = `
${prompt}

IMPORTANT INSTRUCTION: First, think through this task step by step.
Begin your internal analysis by writing "THINKING:" followed by your detailed analysis.
After you've completed your analysis, write "RESPONSE:" followed by your final answer.
The THINKING section should be comprehensive, showing all your reasoning steps.
The RESPONSE section should only contain your final answer.
`;

      // Get the model
      const model = this.client.getGenerativeModel({ 
        model: this.config.model_name,
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF }
        ]
      });

      // Generate content stream
      const result = await model.generateContentStream({
        contents: [{ role: "user", parts: [{ text: thinkingPrompt }] }]
      });

      // Process the stream and separate thinking from response
      let inThinkingMode = false;
      let inResponseMode = false;
      
      for await (const chunk of result.stream) {
        if (chunk.candidates && 
            chunk.candidates.length > 0 && 
            chunk.candidates[0].content && 
            chunk.candidates[0].content.parts && 
            chunk.candidates[0].content.parts.length > 0) {
          
          const text = chunk.candidates[0].content.parts[0].text || '';
          
          // Check for thinking marker
          if (text.includes("THINKING:") && !inResponseMode) {
            inThinkingMode = true;
            
            // Split at THINKING: marker
            const parts = text.split("THINKING:");
            
            // If there's content before the marker, it's preliminary response
            if (parts[0] && parts[0].trim() && onText) {
              onText(parts[0]);
            }
            
            // Process thinking content after the marker
            if (parts.length > 1 && parts[1] && onThinking) {
              onThinking(parts[1]);
            }
            continue;
          }
          
          // Check for response marker
          if (text.includes("RESPONSE:")) {
            inResponseMode = true;
            inThinkingMode = false;
            
            // Split at RESPONSE: marker
            const parts = text.split("RESPONSE:");
            
            // Add any remaining thinking content
            if (parts[0] && parts[0].trim() && inThinkingMode && onThinking) {
              onThinking(parts[0]);
            }
            
            // Process response content after the marker
            if (parts.length > 1 && parts[1] && onText) {
              onText(parts[1]);
            }
            continue;
          }
          
          // Handle content based on current mode
          if (inThinkingMode && onThinking) {
            onThinking(text);
          } else if (inResponseMode && onText) {
            onText(text);
          } else if (onText) {
            // Default case: if no markers found yet, treat as response
            onText(text);
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
   * @returns {Promise<number>} - Token count
   */
  async countTokens(text) {
    if (!this.client || this.apiKeyMissing) {
      throw new Error('Gemini API client not initialized - API key missing');
    }

    try {
      // Get the model
      const model = this.client.getGenerativeModel({ model: this.config.model_name });
      
      // Count tokens using the model API
      const result = await model.countTokens({
        contents: [{ role: "user", parts: [{ text: text }] }]
      });
      
      // Return the token count from the response
      return result.totalTokens || 0;
    } catch (error) {
      console.error('Token counting error:', error);
      
      // Simple fallback - estimate roughly 1 token per 4 characters
      return Math.ceil(text.length / 4);
    }
  }

  /**
   * Calculate token budgets and validate prompt size
   * This is a compatibility method with Claude API
   * @param {number} promptTokens - Number of tokens in the prompt
   * @returns {Object} - Calculated token budgets and limits
   */
  calculateTokenBudgets(promptTokens) {
    // Reasonable defaults that are compatible with Claude API interface
    const contextWindow = 1000000; // Gemini can handle large contexts
    const availableTokens = contextWindow - promptTokens;
    const desiredOutputTokens = this.config.desired_output_tokens || 12000;
    const thinkingBudget = 0; // Gemini doesn't have thinking budgets
    const maxTokens = Math.min(availableTokens, 32000);
    
    return {
      contextWindow,
      promptTokens,
      availableTokens,
      maxTokens,
      thinkingBudget,
      desiredOutputTokens,
      isPromptTooLarge: false
    };
  }

  /**
   * Empty method for Claude API compatibility
   */
  recreate() {
    // Not needed for Gemini
  }

  /**
   * Empty method for Claude API compatibility
   */
  close() {
    // Not needed for Gemini
  }
}

module.exports = GeminiAPIService;