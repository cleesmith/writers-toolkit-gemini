const { GoogleGenAI, HarmCategory, HarmBlockThreshold } = require('@google/genai');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { _getActiveHandles } = require('node:process');

// Better socket cleanup function
function cleanupConnections() {
  console.log('>>> Beginning connection cleanup...');
  
  // Close all active HTTP/HTTPS connections
  // This is more reliable than trying to find TLSSocket objects
  let closedConnections = 0;
  
  // Close HTTP keep-alive connections
  if (http.globalAgent && http.globalAgent.destroy) {
    console.log('>>> Destroying HTTP global agent connections');
    http.globalAgent.destroy();
    closedConnections++;
  }
  
  // Close HTTPS keep-alive connections (this is critical for Google API calls)
  if (https.globalAgent && https.globalAgent.destroy) {
    console.log('>>> Destroying HTTPS global agent connections');
    https.globalAgent.destroy();
    closedConnections++;
  }
  
  // Get all active handles that might be sockets
  const handles = _getActiveHandles();
  
  console.log(`>>> Found ${handles.length} active handles`);
  
  for (const handle of handles) {
    // We need to check for both TLSSocket and Socket
    if (handle && handle.constructor && 
        (handle.constructor.name === 'TLSSocket' || 
         handle.constructor.name === 'Socket')) {
      
      console.log(`>>> Destroying ${handle.constructor.name} to ${handle.servername || handle.remoteAddress || 'unknown'}`);
      
      // For sockets, we first end() then destroy() to ensure clean closure
      if (typeof handle.end === 'function') {
        handle.end();
      }
      
      if (typeof handle.destroy === 'function') {
        handle.destroy();
        closedConnections++;
      }
    }
  }
  
  console.log(`>>> Closed ${closedConnections} connections`);
  return closedConnections;
}

// Helper to gracefully close the Gemini API client
async function closeGeminiClient(aiClient) {
  if (!aiClient) return;
  
  console.log('>>> Closing Gemini API client...');
  
  // Some API clients have a close() method
  if (typeof aiClient.close === 'function') {
    await aiClient.close();
    console.log('>>> Successfully closed Gemini client via close() method');
    return;
  }
  
  // If no explicit close method, we can try to clean up internal resources
  // by checking various internal properties that might exist
  if (aiClient.models) {
    // Some API clients have internal transport objects with cleanup methods
    if (aiClient.models._transport && typeof aiClient.models._transport.close === 'function') {
      await aiClient.models._transport.close();
      console.log('>>> Successfully closed Gemini client transport');
    }
    
    // Try to null out internal references that might be keeping connections alive
    if (aiClient.models.client) {
      console.log('>>> Nullifying internal client references');
      aiClient.models.client = null;
    }
    
    // If there's any internal HTTP agent, try to destroy it
    if (aiClient.models.agent && typeof aiClient.models.agent.destroy === 'function') {
      aiClient.models.agent.destroy();
      console.log('>>> Destroyed internal HTTP agent');
    }
  }
  
  // Check for file client references
  if (aiClient.files) {
    console.log('>>> Cleaning up files client references');
    if (aiClient.files.client) {
      aiClient.files.client = null;
    }
  }
  
  // Force garbage collection to release resources if available
  // Note: This requires running Node with --expose-gc flag
  if (global.gc) {
    console.log('>>> Forcing garbage collection');
    global.gc();
  }
}

async function main() {
  let ai = null;
  let uploadedFileMetadata = null;
  let cleanExitSuccessful = false;
  
  try {
    const apiKeyFromEnv = process.env.GEMINI_API_KEY;
    if (!apiKeyFromEnv) {
      console.error("ERROR: GEMINI_API_KEY environment variable is not set.");
      return; // Using return instead of process.exit() allows for finally block to run
    }

    // Initialize with timeout
    ai = new GoogleGenAI({
      apiKey: apiKeyFromEnv,
      httpOptions: {
        timeout: 900000 // 15 minutes in milliseconds
      }
    });

    const manuscriptFilePath = 'cls_short_manuscript.txt';
    let manuscriptContent = '';

    try {
      if (!fs.existsSync(manuscriptFilePath)) {
        console.error(`ERROR: Manuscript file not found at: ${manuscriptFilePath}`);
        return;
      }
      manuscriptContent = fs.readFileSync(manuscriptFilePath, 'utf8');
      console.log(`Successfully read content from ${manuscriptFilePath} (Size: ${Buffer.byteLength(manuscriptContent, 'utf8')} bytes).`);
    } catch (fileReadError) {
      console.error(`ERROR: Failed to read file '${manuscriptFilePath}'.`);
      console.error("File read error details:", fileReadError.message);
      return;
    }

    try {
      console.log(`\n--- Uploading File to Gemini via ai.files.upload: ${manuscriptFilePath} ---`);
      const uploadStartTime = new Date();

      const uploadParams = {
        file: manuscriptFilePath,
        config: {
          mimeType: 'text/plain',
          displayName: `Manuscript: ${path.basename(manuscriptFilePath)}`
        }
      };

      let uploadResponse;

      if (ai.files && typeof ai.files.upload === 'function') {
        console.log("Using ai.files.upload() with params:", JSON.stringify(uploadParams, null, 2));
        uploadResponse = await ai.files.upload(uploadParams);
      } else {
        console.error("CRITICAL ERROR: 'ai.files.upload' is NOT a function on the initialized 'ai' object. Cannot proceed with file upload.");
        return;
      }

      if (uploadResponse && uploadResponse.uri && uploadResponse.mimeType) {
        uploadedFileMetadata = uploadResponse;
      } else {
        console.error("ERROR: Uploaded file response from 'ai.files.upload' is not in the expected 'File' object format or is missing 'uri'/'mimeType'.");
        console.error("Received response:", JSON.stringify(uploadResponse, null, 2));
        return;
      }

      const uploadEndTime = new Date();
      const uploadDurationMs = uploadEndTime.getTime() - uploadStartTime.getTime();
      console.log(`File uploaded successfully via ai.files in ${(uploadDurationMs / 1000).toFixed(2)} seconds.`);
      console.log(`Uploaded File URI: ${uploadedFileMetadata.uri}`);
      console.log(`Uploaded File MIME Type: ${uploadedFileMetadata.mimeType}`);
      if (uploadedFileMetadata.name) console.log(`Uploaded File Name (ID): ${uploadedFileMetadata.name}`);
      if (uploadedFileMetadata.displayName) console.log(`Uploaded File Display Name: ${uploadedFileMetadata.displayName}`);
      if (uploadedFileMetadata.sizeBytes) console.log(`Uploaded File Size (from API): ${uploadedFileMetadata.sizeBytes} bytes`);
      console.log(`--- End of File Upload ---`);

    } catch (uploadError) {
      console.error(`\nERROR: Failed to upload file '${manuscriptFilePath}' to Gemini via ai.files.`);
      console.error("File upload error details:", uploadError.message);
      if (uploadError.stack) console.error("Stack:", uploadError.stack);
      if (uploadError.response && uploadError.response.data) {
        console.error("API Error Data:", JSON.stringify(uploadError.response.data, null, 2));
      } else if (uploadError.cause) {
        console.error("Cause:", uploadError.cause);
      }
      return;
    }

    const modelName = 'gemini-2.5-pro-preview-05-06';
    const generationConfiguration = {
      responseMimeType: 'text/plain',
    };
    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF },
    ];

    // Define the tasks
    const baseInstructionsFormat = `Your responses must be in PLAIN TEXT ONLY.
ABSOLUTELY DO NOT use any Markdown formatting (such as **, *, #, lists with -, etc.) in any part of your response.

You will analyze the creative fiction manuscript provided (as an uploaded file) for the specific issues described below.
DO NOT include any introductory or concluding remarks (e.g., "Okay, here's the analysis...", "Overall, the manuscript is...").
DO NOT repeat any parts of the manuscript that are correct or do not have issues related to the current focus.
Your response should ONLY consist of the identified issues, formatted as follows for EACH issue found:

Original: [The complete original sentence or a relevant short passage from the manuscript with the issue, exactly as it appears, with no extra quotation marks added by you around the sentence itself.]
Issue(s): [A brief description of the specific problem(s) in that sentence/passage related to the current focus.]
Correction/Suggestion: [The complete corrected sentence if applicable, OR a suggestion on how to address the consistency issue. For consistency issues, clearly explain the inconsistency and suggest what to review or how to align it.]

After each "Correction/Suggestion:", add two newlines before presenting the "Original:" of the next identified issue.

Now, please provide the analysis for the manuscript above using this exact format and focusing on the specific area outlined below.`;

    const tasks = [
      {
        name: "Grammar, Spelling, and Punctuation",
        instructions: `${baseInstructionsFormat}\n\nFOCUS AREA: Grammar, spelling, and punctuation issues.\nFor the "Correction/Suggestion:" line, provide the directly corrected sentence.`
      },
      // Limiting to just one task for demonstration purposes
      // You can uncomment and add more tasks as needed
      /*
      {
        name: "Character Consistency",
        instructions: `${baseInstructionsFormat}\n\nFOCUS AREA: Character consistency issues. This includes:\n- Consistent naming of characters.\n- Consistent physical descriptions (unless changes are clearly part of the plot/development).\n- Consistent personality traits, voice, and behavior (unless character development is explicitly shown and justified).\n- Consistent memories, skills, or knowledge attributed to characters.\n- Consistent relationships between characters.\nFor the "Correction/Suggestion:" line, describe the inconsistency and suggest how to make it consistent or what parts of the manuscript to review for alignment.`
      },
      {
        name: "Plot Consistency",
        instructions: `${baseInstructionsFormat}\n\nFOCUS AREA: Plot consistency issues. This includes:\n- Timeline consistency (logical sequence of events, no unexplained time jumps or contradictions).\n- Cause and effect (actions having believable consequences, or lack of consequences being addressed).\n- Adherence to established rules or logic of the story world (e.g., magic systems, technology).\n- Unresolved plot threads or plot holes.\n- Consistency in objects, locations, or significant plot devices.\n- Character motivations aligning with their actions within the plot.\nFor the "Correction/Suggestion:" line, describe the plot inconsistency, plot hole, or unresolved thread, and suggest how it might be resolved or what parts of the manuscript to review for alignment.`
      }
      */
    ];

    // Process each task one at a time, properly awaiting each one to complete
    for (const task of tasks) {
      console.log(`\n\n======================================================================`);
      console.log(`--- Starting Task: ${task.name} ---`);
      console.log(`======================================================================`);

      const contentsForRequest = [
        {
          role: 'user',
          parts: [
            {
              fileData: {
                mimeType: uploadedFileMetadata.mimeType,
                fileUri: uploadedFileMetadata.uri,
              },
            },
            { text: `\n\n---\nINSTRUCTIONS:\n${task.instructions}` },
          ],
        }
      ];

      const instructionsTextForLogging = contentsForRequest[0].parts[1].text;
      console.log(`\n--- Sending Prompt to Model (${modelName}) for task: ${task.name} ---`);
      console.log(`Instructions Sent to Model:\n${instructionsTextForLogging.substring(0, 500)}... (truncated for brevity)`);
      console.log(`--- End of Instructions Sent ---`);

      let taskSpecificTimerInterval;
      try {
        if (!(ai.models && typeof ai.models.generateContentStream === 'function')) {
          console.error("CRITICAL ERROR: 'ai.models.generateContentStream' is NOT a function. Skipping task.");
          continue;
        }

        const apiCallStartTime = new Date();
        console.log(`\nAPI Call Start Time: ${apiCallStartTime.toLocaleTimeString()}\n`);
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

        let lastUsageMetadata = null;
        
        // IMPORTANT: Properly store the response stream in a variable
        // and make sure we await all operations on it
        const responseStream = await ai.models.generateContentStream({
          model: modelName,
          contents: contentsForRequest,
          generationConfig: generationConfiguration,
          safetySettings: safetySettings,
        });

        // Clear the timer interval immediately after getting response
        if (taskSpecificTimerInterval) {
          clearInterval(taskSpecificTimerInterval);
          taskSpecificTimerInterval = null;
          process.stdout.write('\n');
        }

        const callEndTime = new Date();
        console.log(`\nAPI Call End Time (stream initiated): ${callEndTime.toLocaleTimeString()}\n`);
        const durationMs = callEndTime.getTime() - apiCallStartTime.getTime();
        const durationSeconds = durationMs / 1000;
        const displayTotalSeconds = Math.floor(durationSeconds);
        const displayMinutes = Math.floor(displayTotalSeconds / 60);
        const displayRemainingSeconds = displayTotalSeconds % 60;
        console.log(`Time to initiate stream: ${displayMinutes}m ${displayRemainingSeconds}s`);

        console.log(`\nTask '${task.name}' has returned, processing stream...`);
        console.log("\n--- Gemini Response Stream ---");
        let output = "";
        let chunkCount = 0;
        const streamProcessingStartTime = new Date();

        // Make sure we properly await the for-await loop to complete
        for await (const chunk of responseStream) {
          chunkCount++;
          if (chunk.usageMetadata) {
            lastUsageMetadata = chunk.usageMetadata;
          }
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
            console.warn(`\nSkipping unrecognized or non-text chunk structure in stream (chunk ${chunkCount}):`, JSON.stringify(chunk));
          }
        }
        process.stdout.write('\n');

        if (lastUsageMetadata) {
          console.log(`\n--- Usage Statistics (from last relevant chunk for task: ${task.name}) ---`);
          console.log(`Prompt Token Count: ${lastUsageMetadata.promptTokenCount}`);
          console.log(`Candidates Token Count: ${lastUsageMetadata.candidatesTokenCount}`);
          console.log(`Total Token Count: ${lastUsageMetadata.totalTokenCount}`);
          if (lastUsageMetadata.thoughtsTokenCount !== undefined) {
            console.log(`Thoughts Token Count: ${lastUsageMetadata.thoughtsTokenCount}`);
          }
          console.log(`--- End Usage Statistics ---`);
        } else {
          console.log("\nNo usage metadata was found in the response stream for this task.");
        }

        const streamProcessingEndTime = new Date();
        const streamDurationMs = streamProcessingEndTime.getTime() - streamProcessingStartTime.getTime();
        const streamDurationSeconds = streamDurationMs / 1000;

        if (chunkCount === 0) {
          console.log(`WARNING: Stream for task '${task.name}' completed with 0 chunks containing parsable text.`);
        }
        console.log(`--- End of Stream for task '${task.name}' (processed ${chunkCount} chunks in ${streamDurationSeconds.toFixed(2)} seconds) ---`);

        // Add a small delay to ensure all network operations are complete
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (taskError) {
        if (taskSpecificTimerInterval) {
          clearInterval(taskSpecificTimerInterval);
          process.stdout.write('\n');
        }
        console.error(`\nERROR during task '${task.name}':`);
        console.error("Error message:", taskError.message);
        if (taskError.stack) console.error("Stack:", taskError.stack);
        if (taskError.cause) console.error("Cause:", taskError.cause);
        if (taskError.response) {
          console.error("API Response (if available from error object):", JSON.stringify(taskError.response, null, 2));
        }
        console.log(`--- Skipping to next task due to error in '${task.name}' ---`);
      }
    }

    // Mark successful completion
    cleanExitSuccessful = true;

  } catch (fatalError) {
    console.error("\n--- A FATAL ERROR OCCURRED BEFORE OR DURING TASK LOOP ---");
    console.error("Error message:", fatalError.message);
    if (fatalError.stack) console.error("Stack trace:", fatalError.stack);
  } finally {
    // Clean up no matter what happened
    
    // 1. Delete the uploaded file if it exists
    if (uploadedFileMetadata && uploadedFileMetadata.name) {
      console.log(`\n\n======================================================================`);
      console.log(`--- Attempting to delete uploaded file: ${uploadedFileMetadata.name} ---`);
      console.log(`======================================================================`);
      try {
        if (ai && ai.files && typeof ai.files.delete === 'function') {
          const deleteParams = { name: uploadedFileMetadata.name };
          console.log("Calling ai.files.delete() with params:", JSON.stringify(deleteParams));
          await ai.files.delete(deleteParams);
          console.log(`File ${uploadedFileMetadata.name} deleted successfully.`);
        } else {
          console.warn("WARN: 'ai.files.delete' is not a function. Cannot delete uploaded file.");
        }
      } catch (deleteError) {
        console.error(`ERROR: Failed to delete file '${uploadedFileMetadata.name}'.`);
        console.error("File deletion error details:", deleteError.message);
        if (deleteError.stack) console.error("Deletion Stack:", deleteError.stack);
      }
      console.log(`--- End of File Deletion Attempt ---`);
    }

    // 2. List remaining files (mainly for debug purposes)
    console.log(`\n\n======================================================================`);
    console.log(`--- Listing all project files (after potential deletion) ---`);
    console.log(`======================================================================`);
    try {
      if (ai && ai.files && typeof ai.files.list === 'function') {
        const listParams = {};
        console.log("Calling ai.files.list() with params:", JSON.stringify(listParams));
        const listResponsePager = await ai.files.list(listParams);

        let filesFound = false;
        for await (const file of listResponsePager) {
          filesFound = true;
          console.log(`  - Name: ${file.name}, DisplayName: ${file.displayName || 'N/A'}, URI: ${file.uri}, Size: ${file.sizeBytes || 'N/A'} bytes, MIME: ${file.mimeType}`);
        }
        if (!filesFound) {
          console.log("  No files found for this project.");
        }
      } else {
        console.warn("WARN: 'ai.files.list' is not a function. Cannot list project files.");
      }
    } catch (listError) {
      console.error(`ERROR: Failed to list project files.`);
      console.error("File listing error details:", listError.message);
      if (listError.stack) console.error("Listing Stack:", listError.stack);
    }
    console.log(`--- End of File Listing ---`);

    // 3. Close the Google GenAI client
    try {
      console.log(`\n======================================================================`);
      console.log(`--- Closing the Google GenAI client ---`);
      console.log(`======================================================================`);
      await closeGeminiClient(ai);
      ai = null; // Allow it to be garbage collected
    } catch (closeError) {
      console.error(`ERROR: Failed to close the Google GenAI client.`);
      console.error("Close error details:", closeError.message);
    }
    
    // 4. Clean up network connections
    console.log(`\n======================================================================`);
    console.log(`--- Cleaning up network connections ---`);
    console.log(`======================================================================`);
    const connectionsClosed = cleanupConnections();
    
    // 5. Add a delay to allow any asynchronous cleanup to complete
    console.log(`\n--- Waiting for final cleanup (3 seconds) ---`);
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 6. Do one final connection cleanup
    const finalConnectionsClosed = cleanupConnections();
    
    // Report final status
    console.log(`\n======================================================================`);
    if (cleanExitSuccessful) {
      console.log(`--- Script completed successfully and cleaned up all resources ---`);
    } else {
      console.log(`--- Script completed with errors but cleaned up all resources ---`);
    }
    console.log(`--- Total connections closed: ${connectionsClosed + finalConnectionsClosed} ---`);
    console.log(`======================================================================`);
    
    // 7. Set a graceful exit timeout (last resort)
    console.log('\n--- Setting graceful exit timeout (10 seconds) ---');
    console.log('--- If the script is still running after this time, we will exit gracefully ---');
    console.log('--- This is necessary because some SDK resources may not be fully exposing their cleanup methods ---');
    
    // This approach is preferable to process.exit(0) at the end of main()
    // because it gives the script a chance to exit naturally if possible
    const exitTimeout = setTimeout(() => {
      console.log('\n--- Graceful exit timeout reached, forcing clean exit ---');
      console.log('--- Consider reporting this to the Google GenAI SDK team as a potential resource leak ---');
      process.exit(0);  // Clean exit
    }, 10000);  // 10 seconds
    
    // If the process does exit naturally before the timeout, we'll clear the timeout
    // to avoid a "Promise resolution after process exit" warning
    exitTimeout.unref();  // This allows Node.js to exit even if this timeout is still pending
  }
}

// Run the main function and handle any unhandled promise rejections
main().catch(error => {
  console.error("\n--- A FATAL UNHANDLED ERROR OCCURRED IN main() AND WASN'T CAUGHT BY INNER BLOCKS ---");
  console.error("Error message:", error.message);
  if (error.stack) console.error("Stack trace:", error.stack);
  if (error.cause) console.error("Cause:", error.cause);
  
  // Even in case of fatal error, try to clean up connections
  cleanupConnections();
  
  // Allow a moment for error logging to complete
  setTimeout(() => {
    console.error("\n--- Clean exit failed, had to force termination ---");
    process.exit(1);
  }, 1000);
});
