// proofreader_spelling.js
// A script that performs spelling proofreading using existing file and cache
// Assumes file uploading and caching is handled by other tools

const {
    GoogleGenAI,
    HarmCategory,
    HarmBlockThreshold,
    createUserContent,
    createPartFromUri,
} = require('@google/genai');
const fs = require('fs');
const path = require('path');

/**
 * Helper function to format remaining time until cache expiration
 * @param {string} expireTimeStr - The expiration time string from the API
 * @returns {string} - Human-readable remaining time
 */
function formatRemainingTime(expireTimeStr) {
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
 * Main function to handle the spelling proofreading process
 */
async function main() {
  // Check for API key
  const apiKeyFromEnv = process.env.GEMINI_API_KEY;
  if (!apiKeyFromEnv) {
    console.error("ERROR: GEMINI_API_KEY environment variable is not set.");
    process.exit(1);
  }

  // Initialize the Gemini API client
  const ai = new GoogleGenAI({ apiKey: apiKeyFromEnv });

  // File to proofread
  const manuscriptFilePath = 'test_proofread.txt';
  const manuscriptFileName = path.basename(manuscriptFilePath);
  
  // Read the manuscript file (local copy for reference)
  let manuscriptContent = '';
  try {
    if (!fs.existsSync(manuscriptFilePath)) {
      console.error(`ERROR: Manuscript file not found at: ${manuscriptFilePath}`);
      process.exit(1);
    }
    manuscriptContent = fs.readFileSync(manuscriptFilePath, 'utf8');
    console.log(`Successfully read local content from ${manuscriptFilePath} (Size: ${Buffer.byteLength(manuscriptContent, 'utf8')} bytes).`);
  } catch (fileReadError) {
    console.error(`ERROR: Failed to read file '${manuscriptFilePath}'.`);
    console.error("File error details:", fileReadError.message);
    process.exit(1);
  }

  // Step 1: Check for existing file and cache
  let uploadedFileMetadata;
  let existingCache;
  
  try {
    console.log(`\n--- Checking for existing file uploads ---`);
    
    // Find the previously uploaded file
    if (ai.files && typeof ai.files.list === 'function') {
      const fileListParams = {};
      const fileListResponsePager = await ai.files.list(fileListParams);
      
      let fileCount = 0;
      for await (const file of fileListResponsePager) {
        fileCount++;
        console.log(`Found file #${fileCount}:`);
        console.log(`- Name: ${file.name}`);
        console.log(`- Display Name: ${file.displayName || 'N/A'}`);
        console.log(`- MIME Type: ${file.mimeType}`);
        console.log(`- Size: ${file.sizeBytes} bytes`);
        console.log(`- State: ${file.state}`);
        
        // Use the first active file found (assuming there should only be one)
        if (file.state === 'ACTIVE' && !uploadedFileMetadata) {
          console.log("Using this file for proofreading.");
          uploadedFileMetadata = file;
        }
      }
      
      if (fileCount === 0) {
        console.error("ERROR: No files found in the project. Please upload a file before running this tool.");
        process.exit(1);
      }
      
      if (!uploadedFileMetadata) {
        console.error("ERROR: No ACTIVE files found. Please ensure there is an active file before running this tool.");
        process.exit(1);
      }
    } else {
      console.error("ERROR: Cannot access files API. Required for this tool to function.");
      process.exit(1);
    }
    
    console.log(`\n--- Checking for existing caches ---`);
    
    // Find the previously established cache
    if (ai.caches && typeof ai.caches.list === 'function') {
      const cacheListParams = { pageSize: 20 };
      const cacheListResponsePager = await ai.caches.list(cacheListParams);
      
      let cacheCount = 0;
      let activeModelName = 'gemini-2.5-pro-preview-05-06'; // Default model name
      
      for await (const cache of cacheListResponsePager) {
        cacheCount++;
        const remainingTime = formatRemainingTime(cache.expireTime);
        console.log(`Found cache #${cacheCount}:`);
        console.log(`- Name: ${cache.name}`);
        console.log(`- Model: ${cache.model}`);
        console.log(`- Display Name: ${cache.displayName || 'N/A'}`);
        console.log(`- Expires: ${new Date(cache.expireTime).toLocaleString()} (Remaining: ${remainingTime})`);
        
        // Use the first non-expired cache found (assuming there should only be one)
        if (new Date(cache.expireTime) > new Date() && !existingCache) {
          console.log("Using this cache for proofreading.");
          existingCache = cache;
          activeModelName = cache.model;
        }
      }
      
      if (cacheCount === 0) {
        console.log("NOTE: No existing caches found. Will proceed without cache.");
      } else if (!existingCache) {
        console.log("NOTE: All found caches are expired. Will proceed without cache.");
      }
    } else {
      console.log("NOTE: Cannot access caches API. Will proceed without cache support.");
    }
    
  } catch (resourceError) {
    console.error(`\nERROR: Failed to check for existing resources.`);
    console.error("Error details:", resourceError.message);
    if (resourceError.stack) console.error("Stack:", resourceError.stack);
    process.exit(1);
  }

  // Spelling check instructions
  const spellingPrompt = `Perform a comprehensive word-by-word spelling check on the entire document while being sensitive to intentional stylistic choices.

Your task:
1. Examine EVERY single word in sequence, comparing each against standard English spelling
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
Note: This appears to be intentional non-standard language that might reflect [character voice/dialect/colloquial speech/etc.]. While not standard English, this may be a stylistic choice rather than an error.
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
`;

  // Step 2: Perform the spelling proofreading task
  try {
    // Determine model to use based on the found cache
    const modelName = existingCache ? existingCache.model : 'gemini-2.5-pro-preview-05-06';
    
    // Configure response format and safety settings
    const generationConfiguration = {
      responseMimeType: 'text/plain',
    };
    
    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF },
    ];
    
    // Request setup with timer for monitoring
    let taskSpecificTimerInterval;
    const apiCallStartTime = new Date();
    console.log(`\n--- Beginning Spelling Proofreading Task ---`);
    console.log(`Using model: ${modelName}`);
    console.log(`API Call Start Time: ${apiCallStartTime.toLocaleTimeString()}\n`);
    process.stdout.write("elapsed: 0m 0s");
    
    const updateTimer = () => {
      const now = new Date();
      const elapsedMs = now.getTime() - apiCallStartTime.getTime();
      const totalSeconds = Math.floor(elapsedMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      process.stdout.cursorTo(0);
      process.stdout.clearLine(0);
      process.stdout.write(`elapsed: ${minutes}m ${seconds}s`);
    };
    
    taskSpecificTimerInterval = setInterval(updateTimer, 1000);

    // Include both the file and instructions explicitly
    const contentsForRequest = [
      {
        role: 'user',
        parts: [
          // Include the prompt and explicitly reference the file
          { text: spellingPrompt },
          createPartFromUri(uploadedFileMetadata.uri, uploadedFileMetadata.mimeType)
        ],
      }
    ];
    
    // Check if the generateContentStream function exists
    if (!(ai.models && typeof ai.models.generateContentStream === 'function')) {
      console.error("CRITICAL ERROR: 'ai.models.generateContentStream' is NOT a function.");
      process.exit(1);
    }

    // Prepare API call parameters
    const apiParams = {
      model: modelName,
      contents: contentsForRequest,
      generationConfig: generationConfiguration,
      safetySettings: safetySettings,
    };
    
    // If we have a cache, reference it
    if (existingCache) {
      apiParams.cachedContent = existingCache.name;
      console.log(`Using cache: ${existingCache.name}`);
    } else {
      console.log("No cache being used for this request.");
    }

    // Generate content 
    let lastUsageMetadata = null;
    const responseStream = await ai.models.generateContentStream(apiParams);

    clearInterval(taskSpecificTimerInterval);
    process.stdout.write('\n');

    const callEndTime = new Date();
    console.log(`\nAPI Call End Time (stream initiated): ${callEndTime.toLocaleTimeString()}\n`);
    const durationMs = callEndTime.getTime() - apiCallStartTime.getTime();
    const durationSeconds = durationMs / 1000;
    const displayTotalSeconds = Math.floor(durationSeconds);
    const displayMinutes = Math.floor(displayTotalSeconds / 60);
    const displayRemainingSeconds = displayTotalSeconds % 60;
    console.log(`Time to initiate stream: ${displayMinutes}m ${displayRemainingSeconds}s`);

    // Process the response stream
    console.log("\n--- Gemini Response Stream (Spelling Proofreading Results) ---");
    let output = "";
    let chunkCount = 0;
    const streamProcessingStartTime = new Date();

    for await (const chunk of responseStream) {
      chunkCount++;
      
      // Track usage metadata
      if (chunk.usageMetadata) {
        lastUsageMetadata = chunk.usageMetadata;
      }
      
      // Process text content from chunks
      if (chunk && chunk.candidates && chunk.candidates.length > 0 &&
          chunk.candidates[0].content && chunk.candidates[0].content.parts &&
          chunk.candidates[0].content.parts.length > 0 &&
          typeof chunk.candidates[0].content.parts[0].text === 'string') {
        const textContent = chunk.candidates[0].content.parts[0].text;
        output += textContent;
        process.stdout.write(textContent);
      } else if (chunk && chunk.error) {
        console.error(`\nERROR in stream chunk ${chunkCount}:`, JSON.stringify(chunk.error));
        break;
      } else {
        console.warn(`\nSkipping unrecognized chunk in stream (chunk ${chunkCount}):`, JSON.stringify(chunk));
      }
    }
    process.stdout.write('\n');

    // Display usage statistics
    if (lastUsageMetadata) {
      console.log(`\n--- Usage Statistics ---`);
      console.log(`Prompt Token Count: ${lastUsageMetadata.promptTokenCount}`);
      if (lastUsageMetadata.cachedContentTokenCount !== undefined) {
         console.log(`Cached Content Token Count: ${lastUsageMetadata.cachedContentTokenCount} (Tokens from the cache)`);
      }
      console.log(`Candidates Token Count: ${lastUsageMetadata.candidatesTokenCount}`);
      console.log(`Total Token Count: ${lastUsageMetadata.totalTokenCount} (Includes prompt, cached, and candidates)`);
      if (lastUsageMetadata.thoughtsTokenCount !== undefined) {
        console.log(`Thoughts Token Count: ${lastUsageMetadata.thoughtsTokenCount}`);
      }
      console.log(`--- End Usage Statistics ---`);
    } else {
      console.log("\nNo usage metadata was found in the response stream.");
    }

    // Finalize stream processing
    const streamProcessingEndTime = new Date();
    const streamDurationMs = streamProcessingEndTime.getTime() - streamProcessingStartTime.getTime();
    const streamDurationSeconds = streamDurationMs / 1000;

    if (chunkCount === 0) {
      console.log(`WARNING: Stream completed with 0 chunks containing parsable text.`);
    }
    
    console.log(`--- End of Stream (processed ${chunkCount} chunks in ${streamDurationSeconds.toFixed(2)} seconds) ---`);

    // Save the spelling review to a file
    try {
      // Generate output file path based on the input file
      const outputFilePath = path.join(
        path.dirname(manuscriptFilePath),
        `${path.basename(manuscriptFilePath, path.extname(manuscriptFilePath))}_spelling_review.txt`
      );
      fs.writeFileSync(outputFilePath, output, 'utf8');
      console.log(`\nSpelling review saved to: ${outputFilePath}`);
    } catch (writeError) {
      console.error(`\nWARNING: Unable to save spelling review to file:`, writeError.message);
    }

  } catch (spellCheckError) {
    if (taskSpecificTimerInterval) {
      clearInterval(taskSpecificTimerInterval);
      process.stdout.write('\n');
    }
    console.error(`\nERROR during spelling proofreading task:`);
    console.error("Error message:", spellCheckError.message);
    if (spellCheckError.stack) console.error("Stack:", spellCheckError.stack);
    if (spellCheckError.cause) console.error("Cause:", spellCheckError.cause);
    if (spellCheckError.response) {
      console.error("API Response (if available from error object):", JSON.stringify(spellCheckError.response, null, 2));
    }
  }
}

// Run the main function with error handling
main().catch(error => {
  console.error("\n--- A FATAL UNHANDLED ERROR OCCURRED IN main() ---");
  console.error("Error message:", error.message);
  if (error.stack) console.error("Stack trace:", error.stack);
  if (error.cause) console.error("Cause:", error.cause);
  process.exit(1);
});
