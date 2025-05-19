// brainstorm.js
const ToolBase = require('./tool-base');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs/promises');

/**
 * Brainstorm Tool
 * Helps generate initial story ideas, prompts, and creative angles.
 * Appends more ideas to the existing 'ideas.txt' file.
 */
class BrainstormTool extends ToolBase {
  constructor(apiService, config = {}) {
    super('brainstorm', config);
    this.apiService = apiService;
  }
  
  /**
   * Execute the tool
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - Execution result
   */
  async execute(options) {
    fileCache.clear(this.name);
    
    // Extract options
    const ideasFile = options.ideas_file;
    const outputFiles = [];
    const conceptOnly = false;
    const charactersOnly = false;
    let saveDir = options.save_dir || appState.CURRENT_PROJECT_PATH;
    
    // Validate save directory
    if (!saveDir) {
      const errorMsg = 'Error: No save directory specified and no current project selected.\n' +
                      'Please select a project or specify a save directory.';
      this.emitOutput(errorMsg);
      throw new Error('No save directory available');
    }
    
    // Ensure file paths are absolute
    const absoluteIdeasFile = this.ensureAbsolutePath(ideasFile, saveDir);
    
    try {
      // Read ideas file
      this.emitOutput(`Reading ideas file: ${absoluteIdeasFile}\n`);
      const ideasContent = await this.readIdeasFile(absoluteIdeasFile);

      // Prepare file and cache for API processing
      const prepareResult = await this.apiService.prepareFileAndCache(ideasContent);
      prepareResult.messages.forEach(message => {
        this.emitOutput(`${message}\n`);
      });
      if (prepareResult.errors.length > 0) {
        this.emitOutput(`\n--- Errors encountered during preparation ---\n`);
        prepareResult.errors.forEach(error => {
          this.emitOutput(`ERROR: ${error}\n`);
        });
      }

      // Generate concept and/or characters based on options
      if (charactersOnly) {
        const outputFile = await this.generateAndAppend("characters", ideasContent, absoluteIdeasFile, saveDir, options);
        outputFiles.push(outputFile);
      } else if (conceptOnly) {
        const outputFile = await this.generateAndAppend("concept", ideasContent, absoluteIdeasFile, saveDir, options);
        outputFiles.push(outputFile);
      } else {
        // Generate both by default
        this.emitOutput("\n*** Generating both concept and characters...\n");
        const conceptFile = await this.generateAndAppend("concept", ideasContent, absoluteIdeasFile, saveDir, options);
        outputFiles.push(conceptFile);
        
        // Read updated ideas file after concept generation
        const updatedIdeasContent = await this.readIdeasFile(absoluteIdeasFile);
        const charactersFile = await this.generateAndAppend("characters", updatedIdeasContent, absoluteIdeasFile, saveDir, options);
        outputFiles.push(charactersFile);
      }
      
      this.emitOutput("\nGeneration complete!\n");
      this.emitOutput(`All content has been appended to: ${absoluteIdeasFile}\n`);
      
      return {
        success: true,
        outputFiles,
        stats: {
          ideasFile: absoluteIdeasFile
        }
      };
      
    } catch (error) {
      console.error('Error in Brainstorm Tool:', error);
      this.emitOutput(`\nError: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Read ideas file
   * @param {string} filepath - Path to ideas file
   * @returns {Promise<string>} - File content
   */
  async readIdeasFile(filepath) {
    try {
      const content = await this.readInputFile(filepath);
      return content.trim();
    } catch (error) {
      this.emitOutput(`Error: Ideas file '${filepath}' not found or couldn't be read.\n`);
      this.emitOutput(`Please specify an existing ideas file with the ideas_file parameter.\n`);
      throw error;
    }
  }
  
  /**
   * Generate content and append to ideas file
   * @param {string} promptType - Type of prompt ("concept" or "characters")
   * @param {string} ideasContent - Content of ideas file
   * @param {string} ideasFile - Path to ideas file
   * @param {string} saveDir - Directory to save output
   * @param {Object} options - Tool options
   * @returns {Promise<string>} - Path to saved file
   */
  async generateAndAppend(promptType, ideasContent, ideasFile, saveDir, options) {
    // Create appropriate prompt
    let prompt;
    if (promptType === "concept") {
      prompt = this.createConceptPrompt(ideasContent, options);
    } else { // characters
      prompt = this.createCharacterPrompt(ideasContent, options);
    }

    this.emitOutput(`\n*** Working on: ${promptType}.txt file...\n`);

    const promptTokens = await this.apiService.countTokens(prompt);
    
    this.emitOutput(`\nSending request to AI API . . .\n`);
    this.emitOutput(`\n`);
    
    const startTime = Date.now();
    let fullResponse = "";
    let thinkingContent = "";

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
    
    this.emitOutput(`\nCompleted in ${minutes}m ${seconds.toFixed(2)}s.\n`);
    
    // No need to remove markdown formatting - trust the API response directly
    const cleanedResponse = fullResponse;
    
    const wordCount = this.countWords(cleanedResponse);
    this.emitOutput(`Generated ${promptType} has approximately ${wordCount} words.\n`);
    
    const responseTokens = await this.apiService.countTokens(cleanedResponse);
    this.emitOutput(`Response token count: ${responseTokens}\n`);
    
    // Append to ideas file
    await this.appendToIdeasFile(ideasFile, cleanedResponse, promptType);
    this.emitOutput(`Content appended to: ${ideasFile}\n`);
    
    // Save a backup copy
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const backupFilename = `${promptType}_${timestamp}.txt`;
    const backupPath = path.join(saveDir, backupFilename);
    await this.writeOutputFile(cleanedResponse, saveDir, backupFilename);
    this.emitOutput(`Backup saved to: ${backupPath}\n`);
    
    // Add to the file cache
    fileCache.addFile('brainstorm', backupPath);
    
    return backupPath;
  }
  
  /**
   * Append content to ideas file
   * @param {string} filepath - Path to ideas file
   * @param {string} newContent - New content to append
   * @param {string} contentType - Type of content ("Concept" or "Characters")
   * @returns {Promise<void>}
   */
  async appendToIdeasFile(filepath, newContent, contentType) {
    try {
      // Read existing content
      let existingContent = await fs.readFile(filepath, 'utf8');
      
      // Format content type with proper capitalization
      const formattedType = contentType.charAt(0).toUpperCase() + contentType.slice(1);
      
      // Get current timestamp
      const timestamp = new Date().toLocaleString();
      
      // Format new content to append
      const contentToAppend = `\n\n# ${formattedType} (Generated ${timestamp})\n\n${newContent}`;
      
      // Append to file
      await fs.writeFile(filepath, existingContent + contentToAppend);
    } catch (error) {
      this.emitOutput(`Error appending to ideas file: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Create concept prompt
   * @param {string} ideasContent - Content of ideas file
   * @param {Object} options - Tool options
   * @returns {string} - Concept prompt
   */
  createConceptPrompt(ideasContent, options) {
    return `You are a skilled novelist and worldbuilder helping to create a detailed concept document in fluent, authentic English.
Draw upon your knowledge of worldwide literary traditions, narrative structure, and worldbuilding approaches from across cultures,
while expressing everything in natural, idiomatic English.

=== IDEAS FILE CONTENT ===
${ideasContent}
=== END IDEAS FILE CONTENT ===


Create a detailed concept document that explores and develops this writing idea. Focus on worldbuilding, setting, themes, and plot possibilities.
The depth level requested is 5, so adjust your detail accordingly.

Structure your response as a CONCEPT DOCUMENT with these clearly labeled sections:

1. HIGH CONCEPT (1-2 paragraphs summarizing the core idea)
2. WORLD/SETTING (detailed description of the world, era, technology, social structures, etc.)
3. CENTRAL CONFLICT (the main tension driving the story)
4. THEMES & MOTIFS (3-5 major themes to be explored)
5. UNIQUE ELEMENTS (what makes this concept fresh and original)
6. PLOT POSSIBILITIES (2-3 paragraphs on possible story directions)
7. TONE & ATMOSPHERE (the feeling and mood of the story)
8. WORLDBUILDING NOTES (10-15 specific details about how this world works)

IMPORTANT FORMATTING INSTRUCTIONS:
1. Start with "CONCEPT DOCUMENT:" at the top of your response
2. Use plain text section headers like "HIGH CONCEPT:"
3. Use plain numbered or bullet lists where appropriate
4. Keep your writing clear, concise, and creative
5. This content will be appended to an ideas file for writing development`;
  }
  
  /**
   * Create character prompt
   * @param {string} ideasContent - Content of ideas file
   * @param {Object} options - Tool options
   * @returns {string} - Character prompt
   */
  createCharacterPrompt(ideasContent, options) {
    return `You are a skilled novelist and character developer helping to create detailed character descriptions in fluent, authentic English.
Draw upon your knowledge of worldwide literary traditions, character development, and psychological complexity from across cultures,
while expressing everything in natural, idiomatic English.

=== IDEAS FILE CONTENT ===
${ideasContent}
=== END IDEAS FILE CONTENT ===

Create details for 5 characters that would fit well in this story concept.

Structure your response as a CHARACTER DOCUMENT with these elements for EACH character:

1. NAME & ROLE (full name and their function in the story)
2. PHYSICAL DESCRIPTION (key physical traits and appearance)
3. PERSONALITY (core character traits, strengths, flaws)
4. BACKGROUND (relevant history and formative experiences)
5. MOTIVATION (what drives this character)
6. ARC (how this character might change throughout the story)
7. SPECIAL SKILLS/ABILITIES (what makes them effective in this world)
8. RELATIONSHIPS (how they connect to other characters)

IMPORTANT FORMATTING INSTRUCTIONS:
1. Number each character entry like "1. Character Name"
2. Use plain text for character details with bullet points or dashes
3. For each character attribute use a dash or bullet format like:
   - role: protagonist
   - personality: determined, resourceful
4. Separate each character with a blank line
5. Keep your writing clear, concise, and psychologically insightful
6. This content will be appended to an ideas file for writing development

STRICT CHARACTER NAME INSTRUCTIONS:
- You MUST use ONLY the exact character names provided in: === CHARACTERS === through === END CHARACTERS === section, if provided
- DO NOT create any new character names not in: === CHARACTERS === through === END CHARACTERS ===
- DO NOT modify, expand, or add to the character names in any way (no adding first/last names, titles, etc.)
- Keep the exact capitalization/title case of each name as provided
- If a character has only a first name or nickname in the list, use ONLY that exact name
- If a character is referred to differently in different parts of the ideas file, use ONLY the specific format provided in the list

BACKGROUND CHARACTER INSTRUCTIONS:
- For incidental characters who briefly appear in scenes (cashiers, waiters, doormen, passersby, etc.), refer to them ONLY by their role or function (e.g., "the cashier," "the doorman").
- DO NOT assign names to these background characters unless they become recurring or important to the plot.
- DO NOT develop backstories for these functional characters.
- Background characters should only perform actions directly related to their function or brief interaction with named characters.
- Keep interactions with background characters brief and purposeful - they should serve the story without becoming story elements themselves.
- If a background character needs to speak, use phrases like "the clerk asked" rather than creating a name.
- Remember that background characters exist to create a realistic world but should remain in the background to keep focus on the main characters and plot.
`;
  }

  /**
   * Count words in text
   * @param {string} text - Text to count words in
   * @returns {number} - Word count
   */
  countWords(text) {
    return text.replace(/(\r\n|\r|\n)/g, ' ').split(/\s+/).filter(word => word.length > 0).length;
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
}

module.exports = BrainstormTool;
