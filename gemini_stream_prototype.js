// --- START OF FILE gemini_stream_prototype.js ---

// To run this code you need to install the following dependencies:
// npm install @google/genai

// Using CommonJS (require):
const genAI = require('@google/genai'); // Import the main module object
const {
    GoogleGenAI,
    HarmCategory,
    HarmBlockThreshold
    // We will try to access other enums via the main genAI object
} = genAI; // Destructure the parts we know work from the main object
const util = require('util');
// require('dotenv').config(); // Uncomment if you use a .env file

// --- Try to access Enums from the main module ---
const TrafficType = genAI.TrafficType;
if (!TrafficType) {
    console.warn("Warning: genAI.TrafficType was not found. Falling back to string comparison for traffic type.");
} else {
    console.log("Successfully accessed TrafficType enum object:", TrafficType);
}

const FinishReason = genAI.FinishReason;
if (!FinishReason) {
    console.warn("Warning: genAI.FinishReason was not found. Falling back to string comparison for finish reason.");
} else {
    console.log("Successfully accessed FinishReason enum object:", FinishReason);
}
// --- ---

async function main() {
  // Ensure your GEMINI_API_KEY is set in your environment
  if (!process.env.GEMINI_API_KEY) {
    console.error("Error: GEMINI_API_KEY environment variable is not set.");
    process.exit(1);
  }

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  });

  // --- Safety Settings ---
  const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF, },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF, },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF, },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF, },
  ];

  // --- Generation Config ---
  const generationConfig = {
    maxOutputTokens: 32000,
    responseMimeType: 'text/plain',
  };

  // --- Model Name ---
  const modelName = 'gemini-2.5-pro-preview-05-06'; // Using your specified model

  // --- Contents / Prompt ---
  const contents = [
    { role: 'user', parts: [{ text: `hello`, }, ], },
    { role: 'user', parts: [{ text: `In the word: strawberry, how many of the letter: r are there?`, }, ], },
  ]; // Using your specified contents


  // --- Get and Log Model Info ---
  console.log(`\n--- Fetching Model Information for: ${modelName} ---`);
  try {
    // Use the modelName variable for consistency, or the direct string as you provided
    const modelInfo = await ai.models.get({ model: modelName });
    console.log("Model Info Received:");
    console.log(util.inspect(modelInfo, { depth: null, colors: true })); // Use util.inspect for better logging
  } catch (modelInfoError) {
    console.error(`Error fetching model info for ${modelName}:`, modelInfoError.message);
    // You might want to log the full error object for more details if needed
    // console.error(modelInfoError);
  }
  console.log("-------------------------------------------------");
  // --- End Model Info ---


  try {
    console.log(`\nSending request to model: ${modelName} ...`); // Added newline for better separation
    const streamResult = await ai.models.generateContentStream({
        model: modelName,
        contents: contents,
        generationConfig: generationConfig,
        safetySettings: safetySettings,
    });
    console.log(`...generateContentStream call returned.`);

    // --- Stream Processing with Metadata Capture ---
    console.log("\n--- Starting stream iteration ---");
    let fullResponseText = '';
    let finalPromptFeedback = null;
    let finalUsageMetadata = null;
    let finalFinishReason = null; // Holds the string value from the API

    for await (const chunk of streamResult) {
      // --- SAFER ACCESS within the loop ---
      if (!chunk) {
        console.warn("[Skipping iteration: Chunk is null or undefined]");
        continue;
      }

      // 1. Extract Text
      let chunkText = '';
      if (chunk.candidates && chunk.candidates[0]?.content?.parts[0]?.text) {
          chunkText = chunk.candidates[0].content.parts[0].text;
      } else if (typeof chunk.text === 'string') {
           chunkText = chunk.text;
      }
      if(chunkText) {
        process.stdout.write(chunkText);
        fullResponseText += chunkText;
      }

      // 2. Capture Metadata
      if (chunk.promptFeedback) { finalPromptFeedback = chunk.promptFeedback; }
      if (chunk.usageMetadata) { finalUsageMetadata = chunk.usageMetadata; }
      if (chunk.candidates && chunk.candidates[0]?.finishReason) {
        finalFinishReason = chunk.candidates[0].finishReason;
      }
      // --- End SAFER ACCESS ---
    }
    console.log(); // Final newline
    console.log("--- Stream iteration finished ---");

    // --- Display Captured Metadata ---
    console.log("\n--- Final Captured Metadata ---");
    console.log("Finish Reason:", finalFinishReason || "Not found");
    if (FinishReason && finalFinishReason) {
        if (finalFinishReason === FinishReason.STOP) { console.log("  (Enum Interpretation: Generation stopped normally.)"); }
        else if (finalFinishReason === FinishReason.MAX_TOKENS) { console.log("  (Enum Interpretation: Reached max tokens.)"); }
        else if (finalFinishReason === FinishReason.SAFETY) { console.log("  (Enum Interpretation: Stopped due to safety.)"); }
    } else if (finalFinishReason) {
        if (finalFinishReason === "STOP") { console.log("  (String Interpretation: Generation stopped normally.)"); }
        else if (finalFinishReason === "MAX_TOKENS") { console.log("  (String Interpretation: Reached max tokens.)"); }
        else if (finalFinishReason === "SAFETY") { console.log("  (String Interpretation: Stopped due to safety.)"); }
    }

    console.log("\nPrompt Feedback:");
    console.log(finalPromptFeedback ? util.inspect(finalPromptFeedback, {depth: null, colors: true}) : "Not found or N/A");

    console.log("\nUsage Metadata (Tokens):");
    if (finalUsageMetadata) {
        console.log(util.inspect(finalUsageMetadata, {depth: null, colors: true}));
        console.log(`  - Prompt Tokens: ${finalUsageMetadata.promptTokenCount ?? 'N/A'}`);
        console.log(`  - Candidates Tokens: ${finalUsageMetadata.candidatesTokenCount ?? 'N/A'}`);
        console.log(`  - Total Tokens: ${finalUsageMetadata.totalTokenCount ?? 'N/A'}`);
        const trafficTypeString = finalUsageMetadata.trafficType;
        if (TrafficType && trafficTypeString) {
            process.stdout.write(`  - Traffic Type: ${trafficTypeString}`);
            if (trafficTypeString === TrafficType.ON_DEMAND) { process.stdout.write(` (Enum Interpretation: On-Demand)\n`); }
            else if (trafficTypeString === TrafficType.PROVISIONED_THROUGHPUT) { process.stdout.write(` (Enum Interpretation: Provisioned)\n`); }
            else if (trafficTypeString === TrafficType.TRAFFIC_TYPE_UNSPECIFIED) { process.stdout.write(` (Enum Interpretation: Unspecified)\n`); }
            else { process.stdout.write(` (Unknown enum value)\n`); }
        } else if (trafficTypeString) {
             console.log(`  - Traffic Type: ${trafficTypeString} (String value)`);
        } else {
             console.log(`  - Traffic Type: N/A (Field not present in response)`);
        }
    } else {
        console.log("Not found or N/A");
    }
    console.log("-----------------------------");

  } catch (error) {
     console.error("\nError during API call or streaming:");
     if (error.message) {
         console.error("Message:", error.message);
         if (error.message.includes("does not exist") || error.message.includes("model not found") || (error.code === 5 && error.message.includes(modelName)) || (error.code === 7 && error.message.includes("permission")) ) {
           console.error(`\n>>> Error suggests an issue accessing model '${modelName}'.`);
           console.error(`>>> Please ensure your API key has access to this preview model.`);
         }
         if (error.message.includes("API key not valid")) {
             console.error("Please check your GEMINI_API_KEY.");
         }
     }
     if (error.response) {
         if (error.response.promptFeedback) {
            console.error("Prompt Feedback (from error):", JSON.stringify(error.response.promptFeedback, null, 2));
         } else if (error.response.status && error.response.data){
            console.error("API Response Error Status:", error.response.status);
            console.error("API Response Error Data:", JSON.stringify(error.response.data, null, 2));
         } else {
            console.error("API Response Error (raw):", error.response);
         }
     } else if (error.stack) {
         console.error("Full Error Stack:", error.stack);
     } else {
         console.error("Full Error Object:", error);
     }
  }
}

main();

// --- END OF FILE gemini_stream_prototype.js ---