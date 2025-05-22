# StoryFlaws

Is a desktop application designed to assist creative fiction writers and editors by providing a suite of AI-powered tools to analyze and improve their manuscripts. It allows authors to manage writing projects and leverage the analytical capabilities of AI models.

StoryFlaws speaks directly to the writer's experience of struggling to identify issues in their own work. 
This app makes the painful process more manageable, and is an integral part of creating great writing. 
It's honest about the process without being negative—editing is about improvement, after all.

### Core Functionality and Architecture

The application operates as a local desktop program, ensuring that project files such as manuscripts, outlines, and world-building documents are stored on the user's computer in a dedicated `~/writing` directory. This provides privacy and control over sensitive creative work.

The toolkit integrates with AI services (Gemini and formerly Claude) to perform complex analyses. It manages API interactions, including handling API keys, managing token limits, and structuring prompts for various analytical tasks. The `main.js` file likely orchestrates the application's lifecycle and inter-process communication, while `renderer.js` handles the user interface logic.

### Key Features and Tools

The `README.md` file outlines a comprehensive set of tools for creative fiction writing. These tools address various aspects of the writing and editing process:

**Manuscript Analysis & Editing:**

* **Tokens & Words Counter:** Estimates Claude API usage and context window requirements by counting approximate tokens and words in text files.

* **Narrative Integrity Checker:** Verifies manuscript consistency against world documents and optional outlines. It can check for world consistency, internal logic, character development, and unresolved plot elements.

* **Character Analyzer:** Identifies and compares character appearances across the manuscript, outline, and world files to maintain consistency.

* **Plot Thread Tracker:** Analyzes manuscripts to identify and track distinct plot threads, showing how they interconnect, converge, and diverge.

* **Tense Consistency Checker:** Scans manuscripts for inconsistent verb tense usage that might confuse readers or disrupt narrative flow.

* **Conflict Analyzer:** Examines conflict patterns at scene, chapter, and arc levels, identifying their nature, escalation, and resolution.

* **Foreshadowing Tracker:** Tracks foreshadowing elements, planted clues, and their payoffs to ensure narrative promises are fulfilled.

* **Dangling Modifier Checker:** Identifies dangling and misplaced modifiers that could create confusion or unintended humor.

* **Crowding & Leaping Evaluator:** Analyzes manuscripts for pacing issues based on Ursula K. Le Guin's concepts of "crowding" (intense detail) and "leaping" (jumping over time/events), identifying dense paragraphs and abrupt transitions.

* **Adjective & Adverb Optimizer:** Reviews manuscripts for adjective and adverb usage, identifying unnecessary modifiers and suggesting stronger verbs/nouns.

* **Rhythm Analyzer:** Measures sentence length variations, detects monotonous patterns, and highlights passages where the sound doesn't match the intended mood.

* **Punctuation Auditor:** Identifies issues like run-on sentences, missing commas, and odd punctuation patterns that might hinder clarity and flow.

* **Developmental Editing:** Analyzes the manuscript for structural issues, including plot holes, character arcs, pacing, narrative viewpoint, themes, and worldbuilding.

* **Line Editing:** Performs detailed line editing on specific chapters.

* **Copy Editing:** Corrects grammar, syntax, punctuation, and ensures consistency in spelling, formatting, and timelines.

* **Proofreader (Mechanical):** Focuses on mechanical errors like spelling, grammar, punctuation, and basic formatting.

* **Proofreader (Plot Consistency):** Specifically checks for inconsistencies in plot elements, world rules, and narrative causality.


**Content Generation & Organization:**

* **Brainstorm Tool:** Helps generate initial story ideas, prompts, and creative angles, appending them to an `ideas.txt` file.

* **Outline Writer:** Generates a plot outline from a brainstorming/premise file, with options to use an existing skeleton.

* **World Writer:** Extracts and develops characters and world elements from a novel outline, requiring a title, point-of-view, and existing `characters.txt` and `outline.txt` files.

* **Chapter Writer:** Uses the outline, a chapter list, world document, and any existing manuscript portions to draft new chapters.

* **Manuscript Extractor / Manuscript to Outline, Characters, World:** Analyzes an existing manuscript to generate `outline.txt`, `characters.txt`, and `world.txt` files, helping users transition existing work into the toolkit's structure.


**Utility Tools:**

* **DOCX Text/Comments Extractor:** Extracts comments and their associated text from `.docx` files and saves them to a text file.

* **EPUB to TXT Converter:** Converts `.epub` files into plain text.

* **KDP Publishing Preparation:** Analyzes a manuscript to generate elements for Kindle Direct Publishing, such as title suggestions, descriptions, categories, and keywords.

* **Drunk Claude:** A tool that provides a "brutally honest" critique of a manuscript, adopting a persona.


### User Interface and Workflow

The application features a main interface (`index.html`, `renderer.js`) where users can:

1.  **Select or Create a Project:** Projects are managed in the `~/writing` directory. A project dialog (`project-dialog.html`, `project-dialog.js`) facilitates this.

2.  **Select a Tool:** Tools are categorized into AI-based and non-AI tools, selectable via dropdown menus.

3.  **Configure and Run Tools:** A dedicated "Tool Setup & Run" interface (`tool-setup-run.html`, `tool-setup-run.js`) allows users to configure parameters for the selected tool and then execute it. Output and progress are displayed in this interface.

4.  **View Results:** Generated reports and files can be viewed and edited using a built-in text editor (`editor-dialog.html`, `editor-dialog.js`, `renderer/editor/index.html`, `renderer/editor/renderer.js`).

5.  **Toggle Theme:** The UI supports dark and light modes.


### Technical Aspects

* **Electron Application:** The toolkit is built as a desktop application using Electron (`main.js`, `preload.js`, `forge.config.js`).

* **Node.js Backend:** JavaScript files suggest a Node.js environment for tool logic and file system operations.

* **AI Integration:**
    * Primarily uses the Gemini API, with services defined in `client.js` (GeminiAPIService).
    * Previously supported Claude API, evident from `claude_client.js` and references in tool descriptions.
    * The `GeminiAPIService` in `client.js` includes methods for streaming responses with a simulated "thinking" step, counting tokens, and calculating token budgets to work within API limits. It also handles safety settings for content generation.
    * The `@google/genai` SDK is used for Gemini API interactions, as shown in `package.json` and `@google:genai.txt`.
* **Modular Tool System:** Each tool is implemented as a class extending `ToolBase` (`base-tool.js`), promoting modularity. A `tool-system.js` and `registry.js` manage the loading and execution of these tools.

* **File Handling:**
    * `file-utils.js` likely provides common file reading/writing utilities.
    * `file-cache.js` appears to track output files generated by tools.

* **Dependencies:** Key dependencies listed in `package.json` include:
    * `@google/genai`: For Gemini API.
    * `@anthropic-ai/sdk`: For (likely previous) Claude API integration.
    * `electron-store`: For persisting application settings.
    * `mammoth`: For DOCX to HTML conversion (likely used by DOCX tools).
    * `jszip`: For handling ZIP archives (used in EPUB and DOCX processing).
    * `xmldom`, `xpath`: For XML parsing (used in EPUB and DOCX processing).
    * `docx`: For creating DOCX files (likely for export functionality).

* **State Management:** `state.js` manages global application state, including current project paths, API configurations, and selected tool information.
* **Distribution:**
    * `forge.config.js` configures Electron Forge for building the application for different platforms (macOS, Windows).
    * `create-dmg.txt` provides instructions for creating a macOS DMG installer.


### Configuration and Data Management

* **Project-Based:** Work is organized into projects, each residing in its own subdirectory within `~/writing`.

* **Local File Storage:** All primary data (manuscripts, outlines, world files, tool outputs) are stored as text files within the current project directory.

* **Output Files:** Tools generate timestamped output files to avoid overwriting previous results.

In summary, the Writer's Toolkit is a comprehensive desktop application that empowers authors with a range of AI-driven and utility tools to enhance their creative writing process, from initial brainstorming and drafting to in-depth analysis and editing, all while keeping their work stored locally.
