// main.js - Writer's Toolkit main process
const { app, BrowserWindow, Menu, ipcMain, dialog, screen, shell } = require('electron');

// Handle Squirrel events
if (require('electron-squirrel-startup')) app.quit();

const path = require('path');
const fs = require('fs');
const os = require('os');

require('dotenv').config({ path: require('os').homedir() + '/.env' });

const { v4: uuidv4 } = require('uuid');
const appState = require('./state.js');
const toolSystem = require('./tool-system');
const fileCache = require('./file-cache');

let mainWindow = null;

let editorDialogWindow = null;

// Declare AiApiServiceInstance at a scope accessible by initializeApp and IPC handlers
let AiApiServiceInstance = null;

// Determine if we're running in packaged mode
const isPackaged = app.isPackaged || !process.defaultApp;

// Configure paths for packaged application
if (isPackaged) {
  console.log('Running in packaged mode');
  
  // Get the Resources path where our app is located
  const resourcesPath = path.join(app.getAppPath(), '..');
  console.log(`Resources path: ${resourcesPath}`);
  
  // Ensure the current working directory is correct
  try {
    // Set working directory to the app's root
    process.chdir(app.getAppPath());
    console.log(`Set working directory to: ${process.cwd()}`);
  } catch (error) {
    console.error('Failed to set working directory:', error);
  }
  
  // Explicitly expose the location of tools to global scope
  global.TOOLS_DIR = app.getAppPath();
  console.log(`Set global TOOLS_DIR to: ${global.TOOLS_DIR}`);
} else {
  console.log('Running in development mode');
  global.TOOLS_DIR = path.join(__dirname);
  console.log(`Set global TOOLS_DIR to: ${global.TOOLS_DIR}`);
}

// Only one whenReady that does everything in proper sequence
app.whenReady().then(() => {
  // 1. Set App User Model ID first
  app.setAppUserModelId("com.slipthetrap.writerstoolkit");
  
  // 2. Register DevTools shortcut
  const { globalShortcut } = require('electron');
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow) {
      focusedWindow.webContents.openDevTools();
    }
  });
  
  // 3. Initialize the app
  initializeApp();
});
async function initializeApp() {
  try {
    await appState.initialize();

    // Initialize tool system and get the AiApiService instance
    const toolSystemResult = await toolSystem.initializeToolSystem(getCompleteApiSettings());

    AiApiServiceInstance = toolSystemResult.AiApiService;

    // console.log(`\nAiApiServiceInstance:`);
    // console.dir(AiApiServiceInstance, { depth: null });

    // Setup IPC handlers (they can now safely access AiApiServiceInstance)
    setupIPCHandlers();
    
    // Create the main application window
    // Assuming createWindow() assigns the created window to the global 'mainWindow' variable
    createWindow(); // This function should set the 'mainWindow' variable

    // Check for API key AFTER the mainWindow is created and potentially shown
    // Ensure mainWindow is ready before trying to show a dialog attached to it.
    // mainWindow.on('ready-to-show', () => { // Or 'did-finish-load'
    // Or simply use a timeout if createWindow shows the window immediately.
    // The original setTimeout of 1000ms was likely to ensure mainWindow is fully ready.

    console.log(`\ncalling: AiApiServiceInstance.verifyAiAPI`);
    const verifiedAiAPI = await AiApiServiceInstance.verifyAiAPI();
    console.log(`verifiedAiAPI=${verifiedAiAPI}`);
    console.dir(verifiedAiAPI);
    console.log(`calling: AiApiServiceInstance.verifyAiAPI\n`);

    if (!verifiedAiAPI) {
        // mainWindow should be defined and ready here as createWindow() is called before this check in initializeApp.
        if (mainWindow && !mainWindow.isDestroyed()) {
            const homeDir = os.homedir();
            const envFilePath = path.join(homeDir, '.env');

            dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: 'Gemini API Key Issue',
                message: 'Connecton failed: Gemini API key not found or invalid.',
                detail: `To use AI-powered tools, your Gemini API key needs to be configured.\n\n` +
                        `- click 'OK' to continue using Writer's Toolkit.\nAI features will be unavailable or may cause errors until the api key is set.\nHowever, non-AI based Tools are available for use.\n\n` +
                        `- click 'Quit then Edit .env file' to open the .env configuration file.\nWriter's Toolkit will then quit.\nYour default text editor should appear.\nAfter adding/changing your key, please start the app again.\n` +
                        `\nYou may do this manually:\nThe .env file must be located here:\n${envFilePath}\nOpen .env in a text editor (Notepad/Textedit), then add the line:\nGEMINI_API_KEY=your_actual_api_key\nand replace 'your_actual_api_key' with your actual api key, then save and quit the editor, then start the Writer's Toolkit again.`,
                buttons: ['OK', 'Quit then Edit .env file'],
                defaultId: 0,
                cancelId: 0
            }).then(async ({ response }) => {
                if (response === 1) { // User clicked "Quit then Edit .env file"
                    try {
                        let envFileExisted = fs.existsSync(envFilePath);
                        let currentEnvContent = "";
                        if (envFileExisted) {
                            currentEnvContent = await fs.promises.readFile(envFilePath, 'utf8');
                        }

                        const timestamp = new Date().toLocaleString();
                        let newEnvContent = currentEnvContent;
                        const instructionalComment = `\n# On ${timestamp}, Writer's Toolkit tried to use Gemini AI API key, but failed!\n# Please ensure the line below is correct and uncommented (remove any leading '#'):\n# GEMINI_API_KEY=your_actual_api_key_here\n... or change/update if this line already exists.\n\n`;

                        if (!currentEnvContent.includes("# Writer's Toolkit tried to use Gemini AI API key, but failed!")) {
                            newEnvContent = instructionalComment + currentEnvContent;
                        }
                        if (!newEnvContent.match(/^GEMINI_API_KEY=/m) && !newEnvContent.match(/^#\s*GEMINI_API_KEY=/m) ) {
                            newEnvContent += (newEnvContent.endsWith('\n\n') ? '' : (newEnvContent.endsWith('\n') ? '\n' : '\n\n')) + 'GEMINI_API_KEY=\n\n';
                        }
                        
                        await fs.promises.writeFile(envFilePath, newEnvContent, 'utf8');
                        console.log(`Guidance comment potentially added/updated in .env file: ${envFilePath}`);

                        // // to reveal .env in Finder/Explorer:
                        // shell.showItemInFolder(envFilePath);

                        // it is possible to not have a default text editor:
                        const openError = await shell.openPath(envFilePath);
                        if (openError) {
                            console.error(`Error opening .env file with shell.openPath: ${openError}`);
                            dialog.showErrorBox('File Access Error', `Could not automatically open the .env file at:\n${envFilePath}\n\nPlease open it manually. Writer's Toolkit will now quit.`);
                        } else {
                            console.log(`Attempted to open .env file: ${envFilePath}`);
                        }
                    } catch (err) {
                        console.error(`Error preparing or opening .env file: ${err.message || err}`);
                        dialog.showErrorBox('Configuration Error', `An error occurred while trying to prepare or open your .env file at:\n${envFilePath}\n\nPlease check it manually. Writer's Toolkit will now quit.`);
                    } finally {
                        console.log('Quitting application after "Setup Key & Quit" option.');
                        app.quit();
                    }
                } else { 
                    console.log('User acknowledged API key warning. AI tools will be unavailable or may error out if used. However, non-AI based Tools are available for use.');
                }
            }).catch(err => {
                console.error('Error displaying API key dialog:', err);
            });
        } else {
            // This case should ideally not be reached if initializeApp is structured well.
            // If mainWindow isn't available, critical functionality is missing.
            console.error('Main window not available for API key dialog. This might indicate an initialization order issue. Quitting.');
            dialog.showErrorBox('Application Error', 'Main window is not available. The application will now close.');
            app.quit();
        }
    }
    
    // Initial project dialog logic
    if (!appState.CURRENT_PROJECT && shouldShowProjectDialog) {
      // This timeout also ensures mainWindow is likely ready for a modal dialog
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) { // Check if main window exists before showing modal
            showProjectDialog();
        }
      }, 500); // Reduced timeout as project dialog is often first interaction
    }

  } catch (error) {
    console.error('Failed to initialize application:', error);
    // Log to file as well
    if (typeof global.logToFile === 'function') {
        global.logToFile(`CRITICAL APP INIT ERROR: ${error.message}\n${error.stack}`);
    }
    app.quit();
  }
}

// In main.js, update the logToFile function to make it globally available
// Simple logging function that writes to a file in the user's home directory
function logToFile(message) {
  const logPath = path.join(os.homedir(), 'writers-toolkit-debug.log');
  const timestamp = new Date().toISOString();
  const logLine = `${timestamp}: ${message}\n`;
  
  try {
    fs.appendFileSync(logPath, logLine);
  } catch (e) {
    // Can't do anything if logging itself fails
  }
}

// Make logToFile available globally so other modules can use it
global.logToFile = logToFile;

// Log startup message
logToFile('=== APPLICATION STARTING ===');

// Catch all uncaught exceptions and log them
process.on('uncaughtException', (error) => {
  logToFile(`CRASH ERROR: ${error.message}`);
  logToFile(`STACK TRACE: ${error.stack}`);
  process.exit(1); // Exit with error code
});

// Log basic environment information
logToFile(`App executable: ${process.execPath}`);
logToFile(`Running in ${isPackaged ? 'packaged' : 'development'} mode`);
logToFile(`Current directory: ${process.cwd()}`);
logToFile(`__dirname: ${__dirname}`);
logToFile(`App path: ${app.getAppPath()}`);

// Log additional paths in packaged mode
if (isPackaged) {
  logToFile(`Resources path: ${path.join(app.getAppPath(), '..')}`);
}

// Define Gemini API schema globally
const GEMINI_API_SCHEMA = [
  { name: 'max_retries',            label: 'Max Retries',                       type: 'number', default: 1,       required: true,  description: 'Maximum retry attempts if an API call fails.' },
  { name: 'request_timeout',        label: 'Request Timeout (seconds)',         type: 'number', default: 300,     required: true,  description: 'Seconds to wait for the API to respond.' },
  { name: 'model_name',             label: 'Model Name',                        type: 'text',   default: 'gemini-2.5-pro-preview-05-06', required: true, description: 'Exact model identifier.' },
  { name: 'max_tokens',             label: 'Max Tokens',                   type: 'number', default: 128000,  required: true,  description: 'Absolute cap for output tokens.' }
];

// Global function to get complete settings 
function getCompleteApiSettings() {
  // Start with an empty settings object
  const completeSettings = {};
  
  // Add all default values from the schema
  GEMINI_API_SCHEMA.forEach(setting => {
    completeSettings[setting.name] = setting.default;
  });
  
  // Override with any existing user settings
  if (appState.settings_ai_api_configuration) {
    for (const key in appState.settings_ai_api_configuration) {
      completeSettings[key] = appState.settings_ai_api_configuration[key];
    }
  }
  
  return completeSettings;
}

// Store references to windows
let projectDialogWindow = null;
let apiSettingsWindow = null;
let toolSetupRunWindow = null;

// Flag to control whether to show the project dialog
let shouldShowProjectDialog = true;

// Store the currently selected tool
let currentTool = null;

// Set application name
app.name = "Writer's Toolkit";

// Define menu template
const menuTemplate = [
  {
    label: 'Writer\'s Toolkit',
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'quit' }
    ]
  },
  // Edit menu with standard operations
  {
    label: 'Edit',
    submenu: [
      { role: 'copy', accelerator: 'CmdOrCtrl+C' },
      { role: 'paste', accelerator: 'CmdOrCtrl+V' },
      { role: 'cut', accelerator: 'CmdOrCtrl+X' },
      { type: 'separator' },
      { role: 'selectAll', accelerator: 'CmdOrCtrl+A' },
    ]
  }
];
// Set the application menu
const menu = Menu.buildFromTemplate(menuTemplate);
Menu.setApplicationMenu(menu);
// cls: this removes the menu, but copy/paste fails:
// Menu.setApplicationMenu(null);

// Function to create project selection dialog
function createProjectDialog() {
  // Create the dialog window
  projectDialogWindow = new BrowserWindow({
    width: 600,
    height: 650,
    parent: mainWindow,
    modal: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    backgroundColor: '#121212', // Dark background
    autoHideMenuBar: true,
  });

  // Load the HTML file
  projectDialogWindow.loadFile(path.join(__dirname, 'project-dialog.html'));

  // Show the window when ready
  projectDialogWindow.once('ready-to-show', () => {
    projectDialogWindow.show();
  });

  // Track window destruction
  projectDialogWindow.on('closed', () => {
    projectDialogWindow = null;
  });
  
  return projectDialogWindow;
}

// Show the project dialog
function showProjectDialog() {
  if (!projectDialogWindow || projectDialogWindow.isDestroyed()) {
    createProjectDialog();
    
    // Pass the current theme to the dialog
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript('document.body.classList.contains("light-mode")')
        .then(isLightMode => {
          if (projectDialogWindow && !projectDialogWindow.isDestroyed()) {
            projectDialogWindow.webContents.send('set-theme', isLightMode ? 'light' : 'dark');
          }
        })
        .catch(err => console.error('Error getting theme:', err));
    }
  } else {
    projectDialogWindow.show();
  }
}

function createWindow() {
  // Get the primary display's work area dimensions
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  console.log('*** Screen dimensions:', screen.getPrimaryDisplay().workAreaSize);  

  // Use 90% of the available width and height
  const windowWidth = Math.floor(width * 0.95);
  const windowHeight = Math.floor(height * 0.95);
  
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    backgroundColor: '#111111', // Dark background
    autoHideMenuBar: false,
  });

  // Center the window
  mainWindow.center();

  // Load the index.html of the app
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

// Setup handlers for project operations
function setupProjectHandlers() {
  // Get list of projects
  ipcMain.handle('get-projects', async () => {
    try {
      // Ensure projects directory exists
      await fs.promises.mkdir(appState.PROJECTS_DIR, { recursive: true });
      
      // List all directories in the projects folder
      const items = await fs.promises.readdir(appState.PROJECTS_DIR);
      
      // Filter to only include directories and exclude hidden directories
      const projects = [];
      for (const item of items) {
        if (item.startsWith('.')) {
          continue; // Skip hidden items
        }
        
        const itemPath = path.join(appState.PROJECTS_DIR, item);
        const stats = await fs.promises.stat(itemPath);
        if (stats.isDirectory()) {
          projects.push(item);
        }
      }
      
      return projects.sort(); // Sort alphabetically
    } catch (error) {
      console.error('Error listing projects:', error);
      return [];
    }
  });
  
  // Open an existing project
  ipcMain.handle('open-project', async (event, projectName) => {
    try {
      const projectPath = path.join(appState.PROJECTS_DIR, projectName);
      
      // Check if the project directory exists
      if (!fs.existsSync(projectPath)) {
        return {
          success: false,
          message: `Project directory does not exist: ${projectPath}`
        };
      }

      // Unconditionally clear API files and caches whenever a project is selected or created.
      console.log(`Project selected/created: ${projectName}. Clearing all API files and caches for the configured API key.`);

      // console.log(`\n\nAiApiServiceInstance:`);
      // console.dir(AiApiServiceInstance, { depth: null });
      // console.log(`..................\n\n`);

      if (AiApiServiceInstance) {
        try {
          console.log(`Calling clearFilesAndCaches (global cleanup for API key)`);
          await AiApiServiceInstance.clearFilesAndCaches(); // No argument needed
        } catch (cleanupError) {
          console.error('Error during global API files and caches cleanup:', cleanupError);
          // Log this error but allow the project switch to continue
          // You might want to show a dialog to the user if critical
          dialog.showErrorBox('API Cleanup Error', `Failed to clear all API files and caches. Please check the logs. Reason: ${cleanupError.message}`);
        }
      } else {
        console.warn('AiApiServiceInstance not available for API data cleanup. This may occur if API key is missing or initialization failed.');
        // Optionally inform the user if this is unexpected
        // dialog.showMessageBox(mainWindow, { // mainWindow should be accessible
        //   type: 'warning',
        //   title: 'API Service Unavailable',
        //   message: 'The AI service is not available, so API files and caches could not be cleared.',
        //   buttons: ['OK']
        // });
      }
      
      // Update application state
      appState.CURRENT_PROJECT = projectName;
      appState.CURRENT_PROJECT_PATH = projectPath;
      appState.DEFAULT_SAVE_DIR = projectPath;
      
      // Save to electron-store
      if (appState.store) {
        appState.store.set('settings', {
          default_save_dir: projectPath,
          current_project: projectName,
          current_project_path: projectPath
        });
      }
      
      return {
        success: true,
        projectPath
      };
    } catch (error) {
      console.error('Error opening project:', error);
      return {
        success: false,
        message: error.message
      };
    }
  });
  
  // Create a new project
  ipcMain.handle('create-project', async (event, projectName) => {
    try {
      const projectPath = path.join(appState.PROJECTS_DIR, projectName);
      
      // Check if the project already exists
      if (fs.existsSync(projectPath)) {
        return {
          success: false,
          message: `Project '${projectName}' already exists`
        };
      }
      
      // Create the project directory
      await fs.promises.mkdir(projectPath, { recursive: true });

      // Unconditionally clear API files and caches whenever a project is selected or created.
      console.log(`Project selected/created: ${projectName}. Clearing all API files and caches for the configured API key.`);

      if (AiApiServiceInstance) {
        try {
          console.log(`Calling clearFilesAndCaches (global cleanup for API key)`);
          await AiApiServiceInstance.clearFilesAndCaches(); // No argument needed
        } catch (cleanupError) {
          console.error('Error during global API files and caches cleanup:', cleanupError);
          // Log this error but allow the project switch to continue
          // You might want to show a dialog to the user if critical
          dialog.showErrorBox('API Cleanup Error', `Failed to clear all API files and caches. Please check the logs. Reason: ${cleanupError.message}`);
        }
      } else {
        console.warn('AiApiServiceInstance not available for API data cleanup. This may occur if API key is missing or initialization failed.');
        // Optionally inform the user if this is unexpected
        // dialog.showMessageBox(mainWindow, { // mainWindow should be accessible
        //   type: 'warning',
        //   title: 'API Service Unavailable',
        //   message: 'The AI service is not available, so API files and caches could not be cleared.',
        //   buttons: ['OK']
        // });
      }

      // Update application state
      appState.CURRENT_PROJECT = projectName;
      appState.CURRENT_PROJECT_PATH = projectPath;
      appState.DEFAULT_SAVE_DIR = projectPath;
      
      // Save to electron-store
      if (appState.store) {
        appState.store.set('settings', {
          default_save_dir: projectPath,
          current_project: projectName,
          current_project_path: projectPath
        });
      }

      return {
        success: true,
        projectPath
      };
    } catch (error) {
      console.error('Error creating project:', error);
      return {
        success: false,
        message: error.message
      };
    }
  });
}

// Function to create the tool setup and run dialog
function createToolSetupRunDialog(toolName) {
  // Create the dialog window
  toolSetupRunWindow = new BrowserWindow({
    width: mainWindow.getSize()[0],
    height: mainWindow.getSize()[1],
    x: mainWindow.getPosition()[0],
    y: mainWindow.getPosition()[1],
    parent: mainWindow,
    modal: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    backgroundColor: '#121212', // Dark background
    autoHideMenuBar: true,
  });

  // Load the HTML file
  toolSetupRunWindow.loadFile(path.join(__dirname, 'tool-setup-run.html'));

  // Show the window when ready
  toolSetupRunWindow.once('ready-to-show', () => {
    toolSetupRunWindow.show();
    
    // Send the current theme as soon as the window is ready
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript('document.body.classList.contains("light-mode")')
        .then(isLightMode => {
          if (toolSetupRunWindow && !toolSetupRunWindow.isDestroyed()) {
            toolSetupRunWindow.webContents.send('set-theme', isLightMode ? 'light' : 'dark');
          }
        })
        .catch(err => console.error('Error getting theme:', err));
    }
  });

  // Track window destruction
  toolSetupRunWindow.on('closed', () => {
    toolSetupRunWindow = null;
  });
  
  // Prevent the tool window from being resized or moved
  toolSetupRunWindow.setResizable(false);
  toolSetupRunWindow.setMovable(false);
  
  return toolSetupRunWindow;
}

// Show the tool setup dialog - MODIFIED: always recreate the window
function showToolSetupRunDialog(toolName) {
  // Always close any existing tool window first
  if (toolSetupRunWindow && !toolSetupRunWindow.isDestroyed()) {
    toolSetupRunWindow.destroy();
    toolSetupRunWindow = null;
  }
  
  // Store the selected tool
  currentTool = toolName;
  console.log(`Creating new tool setup dialog for: ${toolName}`);
  
  // Create a new dialog window with the current tool
  createToolSetupRunDialog(toolName);
}

function launchEditor(fileToOpen = null) {
  return new Promise((resolve) => {
    try {
      createEditorDialog(fileToOpen);
      resolve(true);
    } catch (error) {
      console.error('Error launching editor:', error);
      if (typeof global.logToFile === 'function') {
        global.logToFile(`Error launching editor: ${error.message}`);
      }
      resolve(false);
    }
  });
}

// Handle opening files directly in the editor
ipcMain.handle('open-file-in-editor', async (event, filePath) => {
  try {
    // Verify the file exists
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File not found: ' + filePath };
    }
    
    // Create editor dialog window
    createEditorDialog(filePath);
    
    // Return success
    return { success: true };
  } catch (error) {
    console.error('Error opening file in editor:', error);
    return { success: false, error: error.message };
  }
});

// Handle saving files from the editor dialog
ipcMain.handle('save-file', async (event, data) => {
  try {
    const { filePath, content, saveAs } = data;
    let finalPath = filePath;
    
    // If no path or saveAs is true, show save dialog
    if (!finalPath || saveAs) {
      try {
        // Get the current project path as the default save directory
        const projectPath = appState.CURRENT_PROJECT_PATH || path.join(os.homedir(), 'writing');
        
        const { canceled, filePath: newPath } = await dialog.showSaveDialog(editorDialogWindow, {
          title: 'Save File',
          defaultPath: projectPath,
          filters: [
            { name: 'Text Files', extensions: ['txt'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        });
        
        if (canceled || !newPath) {
          return { success: false };
        }
        
        finalPath = newPath;
      } catch (error) {
        console.error('Error showing save dialog:', error);
        return { success: false };
      }
    }
    
    try {
      fs.writeFileSync(finalPath, content, 'utf8');
      console.log('File saved successfully to:', finalPath);
      return { success: true, filePath: finalPath };
    } catch (error) {
      console.error('Error saving file:', error);
      dialog.showErrorBox('Error', `Failed to save file: ${error.message}`);
      return { success: false };
    }
  } catch (error) {
    console.error('Error in save-file handler:', error);
    return { success: false };
  }
});

// Setup handlers for tool operations
function setupToolHandlers() {
  ipcMain.handle('get-tools', () => {
    // console.log('get-tools handler called');
    
    // Get all tool IDs
    const allToolIds = toolSystem.toolRegistry.getAllToolIds();
    // console.log(`Found ${allToolIds.length} tools in registry:`, allToolIds);
    // console.log('Raw tool IDs from registry:', allToolIds);
    
    // Map IDs to tool objects with required properties
    const tools = allToolIds.map(id => {
      const tool = toolSystem.toolRegistry.getTool(id);
      if (!tool) {
        console.error(`Tool with ID ${id} exists in registry but could not be retrieved`);
        throw new Error(`Tool with ID ${id} exists in registry but could not be retrieved`);
      }
      
      // Log each tool's properties
      // console.log(`Tool ${id} properties:`, {
      //   hasConfig: !!tool.config,
      //   title: tool.config?.title || 'missing',
      //   description: tool.config?.description || 'missing'
      // });

      // console.log(`>>> Tool ${id} description debugging:`, {
      //   'tool.config?.description': tool.config?.description,
      //   'tool.title': tool.config?.title
      // });      

      // Ensure tool has required properties
      return {
        name: id,
        title: tool.config?.title || id,
        description: tool.config?.description || tool.title || `Tool: ${id}`
      };
    });
    
    // console.log(`Returning ${tools.length} tools to renderer`);
    // console.log('Tool details being returned:', tools);
    return tools;
  });

  ipcMain.handle('get-tool-options', (e, toolName) => {
    const t = toolSystem.toolRegistry.getTool(toolName);
    return t ? (t.config.options || []) : [];
  });
  
  // Show tool setup dialog
  ipcMain.on('show-tool-setup-dialog', (event, toolName) => {
    showToolSetupRunDialog(toolName);
  });
  
  // Handle tool dialog closing
  ipcMain.on('close-tool-dialog', (event, action, data) => {
    if (toolSetupRunWindow && !toolSetupRunWindow.isDestroyed()) {
      toolSetupRunWindow.destroy();
      toolSetupRunWindow = null;
    }
  });
  
  // Get current tool
  ipcMain.handle('get-current-tool', () => {
    try {
      if (currentTool) {
        // Try to get from registry first
        const tool = toolSystem.toolRegistry.getTool(currentTool);
        if (tool) {
          return {
            name: currentTool,
            title: tool.config.title || currentTool,
            description: tool.config.description || ''
          };
        }
      }
      return null;
    } catch (error) {
      console.error('Error getting current tool:', error);
      return null;
    }
  });
  
  // When updating the start-tool-run handler:
  ipcMain.handle('start-tool-run', async (event, toolName, optionValues) => {
    try {
      // Generate a unique run ID
      const runId = uuidv4();
      
      // Set up output function
      const sendOutput = (text) => {
        if (toolSetupRunWindow && !toolSetupRunWindow.isDestroyed()) {
          toolSetupRunWindow.webContents.send('tool-output', { 
            runId, 
            text 
          });
        }
      };
      
      // Execute the tool in the background
      (async () => {
        try {
          // Send initial output notification
          sendOutput(`Starting ${toolName}...\n\n`);
          
          // Get the tool
          const tool = toolSystem.toolRegistry.getTool(toolName);
          
          if (!tool) {
            throw new Error(`Tool not found: ${toolName}`);
          }
          
          // Add output function to the tool
          tool.emitOutput = sendOutput;

          fileCache.clear(toolName);

          // Execute the tool
          const result = await toolSystem.executeToolById(toolName, optionValues, runId);
          
          // Get files from cache
          const cachedFiles = fileCache.getFiles(toolName);
          
          // Combine cached files with any files returned by the tool
          const allFiles = [...new Set([
            ...(result.outputFiles || []),
            ...cachedFiles.map(file => file.path)
          ])];
          
          // Send completion notification
          if (toolSetupRunWindow && !toolSetupRunWindow.isDestroyed()) {
            toolSetupRunWindow.webContents.send('tool-finished', { 
              runId, 
              code: 0, 
              createdFiles: allFiles 
            });
          }
        } catch (error) {
          console.error(`Error running tool ${toolName}:`, error);
          if (toolSetupRunWindow && !toolSetupRunWindow.isDestroyed()) {
            toolSetupRunWindow.webContents.send('tool-error', { 
              runId, 
              error: error.message 
            });
          }
        }
      })();
      
      return runId;
    } catch (error) {
      console.error('Error starting tool run:', error);
      throw error;
    }
  });
  
  // Store tool options in app state
  ipcMain.handle('set-tool-options', (event, options) => {
    try {
      appState.OPTION_VALUES = options;
      return true;
    } catch (error) {
      console.error('Error setting tool options:', error);
      return false;
    }
  });
}

function createEditorDialog(fileToOpen = null) {
  // If there's already an editor window open, close it first
  if (editorDialogWindow && !editorDialogWindow.isDestroyed()) {
    editorDialogWindow.destroy();
    editorDialogWindow = null;
  }

  // Get the parent window - either the tool window or main window
  const parentWindow = toolSetupRunWindow || mainWindow;

  editorDialogWindow = new BrowserWindow({
    width: parentWindow.getSize()[0],
    height: parentWindow.getSize()[1],
    x: parentWindow.getPosition()[0],
    y: parentWindow.getPosition()[1],
    parent: parentWindow,
    modal: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      // Enable clipboard operations without spellcheck
      additionalArguments: ['--enable-clipboard-read', '--enable-clipboard-write']
    },
    backgroundColor: '#121212', // Dark background
    autoHideMenuBar: true, // Hide the menu bar
  });

  // Load the HTML file
  editorDialogWindow.loadFile(path.join(__dirname, 'editor-dialog.html'));

  // Show the window when ready
  editorDialogWindow.once('ready-to-show', () => {
    editorDialogWindow.show();
    
    // Send the current theme as soon as the window is ready
    if (parentWindow) {
      parentWindow.webContents.executeJavaScript('document.body.classList.contains("light-mode")')
        .then(isLightMode => {
          if (editorDialogWindow && !editorDialogWindow.isDestroyed()) {
            editorDialogWindow.webContents.send('set-theme', isLightMode ? 'light' : 'dark');
          }
        })
        .catch(err => console.error('Error getting theme:', err));
    }
    
    // If a file should be opened, send it to the window
    if (fileToOpen) {
      try {
        const content = fs.readFileSync(fileToOpen, 'utf8');
        editorDialogWindow.webContents.send('file-opened', { 
          filePath: fileToOpen, 
          content 
        });
      } catch (error) {
        console.error('Error loading file:', error);
        dialog.showErrorBox('Error', `Failed to load file: ${error.message}`);
      }
    }
  });

  // Track window destruction
  editorDialogWindow.on('closed', () => {
    editorDialogWindow = null;
  });
  
  // Prevent the editor window from being resized or moved
  editorDialogWindow.setResizable(false);
  editorDialogWindow.setMovable(false);
  
  return editorDialogWindow;
}

// Set up all IPC handlers
function setupIPCHandlers() {
  setupProjectHandlers();
  setupToolHandlers();
  
  // Handle quit request from renderer
  ipcMain.on('app-quit', () => {
    console.log('Quit requested from renderer');
    app.quit();
  });
  
  // Show project dialog
  ipcMain.on('show-project-dialog', () => {
    showProjectDialog();
  });

  // Show editor dialog
  ipcMain.on('show-editor-dialog', (event, filePath) => {
    createEditorDialog(filePath);
  });
  
  // Close editor dialog
  ipcMain.on('close-editor-dialog', () => {
    if (editorDialogWindow && !editorDialogWindow.isDestroyed()) {
      editorDialogWindow.destroy();
      editorDialogWindow = null;
    }
  });

  // Handler for launching the text editor
  ipcMain.on('launch-editor', async (event) => {
    const result = await launchEditor();
    event.returnValue = result;
  });

  // Also add a handle version for Promise-based calls
  ipcMain.handle('launch-editor', async () => {
    return await launchEditor();
  });
  
  // Get current project info
  ipcMain.handle('get-project-info', () => {
    return {
      current_project: appState.CURRENT_PROJECT,
      current_project_path: appState.CURRENT_PROJECT_PATH
    };
  });
  
  // File selection dialog
  ipcMain.handle('select-file', async (event, options) => {
    try {
      // Ensure base directory is inside ~/writing
      const homePath = os.homedir();
      const writingPath = path.join(homePath, 'writing');
      let startPath = options.defaultPath || appState.DEFAULT_SAVE_DIR || writingPath;
      
      // Force path to be within ~/writing
      if (!startPath.startsWith(writingPath)) {
        startPath = writingPath;
      }
      
      // Set default filters to only show .txt files
      const defaultFilters = [
        { name: 'Text Files', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] }
      ];
      
      // For tokens_words_counter.js, only allow .txt files
      if (currentTool === 'tokens_words_counter') {
        // Only use text files filter for this tool
        options.filters = [{ name: 'Text Files', extensions: ['txt', 'md'] }];
      }
      
      const dialogOptions = {
        title: options.title || 'Select File',
        defaultPath: startPath,
        buttonLabel: options.buttonLabel || 'Select',
        filters: options.filters || defaultFilters,
        properties: ['openFile'],
        // Restrict to ~/writing directory
        message: 'Please select a file within your writing projects'
      };
      
      const result = await dialog.showOpenDialog(
        options.parentWindow || toolSetupRunWindow || mainWindow, 
        dialogOptions
      );
      
      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }
      
      const selectedPath = result.filePaths[0];
      
      // Verify the selected path is within ~/writing directory
      if (!selectedPath.startsWith(writingPath)) {
        console.warn('Selected file is outside allowed directory:', selectedPath);
        
        // Show error dialog to user
        await dialog.showMessageBox(toolSetupRunWindow || mainWindow, {
          type: 'error',
          title: 'Invalid File Selection',
          message: 'File Selection Restricted',
          detail: `You must select a file within the ~/writing directory. Please try again.`,
          buttons: ['OK']
        });
        
        return null;
      }
      
      return selectedPath;
    } catch (error) {
      console.error('Error in file selection:', error);
      throw error;
    }
  });
  
  // Directory selection dialog
  ipcMain.handle('select-directory', async (event, options) => {
    try {
      // Ensure base directory is inside ~/writing
      const homePath = os.homedir();
      const writingPath = path.join(homePath, 'writing');
      let startPath = options.defaultPath || appState.DEFAULT_SAVE_DIR || writingPath;
      
      // Force path to be within ~/writing
      if (!startPath.startsWith(writingPath)) {
        startPath = writingPath;
      }
      
      const dialogOptions = {
        title: options.title || 'Select Directory',
        defaultPath: startPath,
        buttonLabel: options.buttonLabel || 'Select',
        properties: ['openDirectory'],
        message: 'Please select a directory within your writing projects'
      };
      
      const result = await dialog.showOpenDialog(
        options.parentWindow || toolSetupRunWindow || mainWindow, 
        dialogOptions
      );
      
      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }
      
      const selectedPath = result.filePaths[0];
      
      // Verify the selected path is within ~/writing directory
      if (!selectedPath.startsWith(writingPath)) {
        console.warn('Selected directory is outside allowed directory:', selectedPath);
        
        // Show error dialog to user
        await dialog.showMessageBox(toolSetupRunWindow || mainWindow, {
          type: 'error',
          title: 'Invalid Directory Selection',
          message: 'Directory Selection Restricted',
          detail: `You must select a directory within the ~/writing directory. Please try again.`,
          buttons: ['OK']
        });
        
        return null;
      }
      
      return selectedPath;
    } catch (error) {
      console.error('Error in directory selection:', error);
      throw error;
    }
  });
  
  // Handle project dialog closing
  ipcMain.on('close-project-dialog', (event, action, data) => {
    if (projectDialogWindow && !projectDialogWindow.isDestroyed()) {
      if (action === 'cancelled') {
        // For Cancel, disable auto-showing and destroy the window
        shouldShowProjectDialog = false;
        projectDialogWindow.destroy();
        projectDialogWindow = null;
      } else {
        // For other actions, just hide the window
        projectDialogWindow.hide();
        
        // If a project was selected or created, notify the main window
        if ((action === 'project-selected' || action === 'project-created') && 
            mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('project-updated', {
            action,
            project: data
          });
        }
      }
    }
  });

  // Convert DOCX to TXT
  ipcMain.handle('convert-docx-to-txt', async (event, docxPath, outputFilename) => {
    try {
      // Ensure we have a current project
      if (!appState.CURRENT_PROJECT_PATH) {
        return {
          success: false,
          message: 'No active project selected'
        };
      }
      
      // Validate output filename
      if (!outputFilename) {
        outputFilename = 'manuscript.txt';
      }
      
      // Ensure it has a .txt extension
      if (!outputFilename.toLowerCase().endsWith('.txt')) {
        outputFilename += '.txt';
      }
      
      // Construct output path
      const outputPath = path.join(appState.CURRENT_PROJECT_PATH, outputFilename);
      
      // Use your existing DOCX to TXT conversion code
      const mammoth = require('mammoth');
      const jsdom = require('jsdom');
      const { JSDOM } = jsdom;
      
      // Load the docx file
      const result = await mammoth.convertToHtml({ path: docxPath });
      const htmlContent = result.value;
      
      // Parse the HTML
      const dom = new JSDOM(htmlContent);
      const document = dom.window.document;
      
      // Get all block elements
      const blocks = document.querySelectorAll("p, h1, h2, h3, h4, h5, h6");
      
      // Process blocks to extract chapters
      let chapters = [];
      let currentChapter = null;
      let ignoreFrontMatter = true;
      let ignoreRest = false;
      
      // Stop headings
      const STOP_TITLES = ["about the author", "website", "acknowledgments", "appendix"];
      
      // Convert NodeList to Array for iteration
      Array.from(blocks).forEach(block => {
        if (ignoreRest) return;
        
        const tagName = block.tagName.toLowerCase();
        const textRaw = block.textContent.trim();
        const textLower = textRaw.toLowerCase();
        
        // Skip everything until first <h1>
        if (ignoreFrontMatter) {
          if (tagName === "h1") {
            ignoreFrontMatter = false;
          } else {
            return;
          }
        }
        
        // If this heading is a "stop" heading, ignore the rest
        if (tagName.startsWith("h") && STOP_TITLES.some(title => textLower.startsWith(title))) {
          ignoreRest = true;
          return;
        }
        
        // If we see a new <h1>, that means a new chapter
        if (tagName === "h1") {
          currentChapter = {
            title: textRaw,
            textBlocks: []
          };
          chapters.push(currentChapter);
        }
        else {
          // If there's no current chapter yet, create one
          if (!currentChapter) {
            currentChapter = { title: "Untitled Chapter", textBlocks: [] };
            chapters.push(currentChapter);
          }
          // Add the block text if not empty
          if (textRaw) {
            currentChapter.textBlocks.push(textRaw);
          }
        }
      });
      
      // Build the manuscript text with proper spacing
      let manuscriptText = "";
      
      chapters.forEach((ch, idx) => {
        // Two newlines before each chapter title
        if (idx === 0) {
          manuscriptText += "\n\n";
        } else {
          manuscriptText += "\n\n\n";
        }
        
        // Add chapter title
        manuscriptText += ch.title;
        
        // One newline after chapter title
        manuscriptText += "\n\n";
        
        // Add paragraphs with one blank line between them
        manuscriptText += ch.textBlocks.join("\n\n");
      });
      
      // Write to output file
      await fs.promises.writeFile(outputPath, manuscriptText);
      
      return {
        success: true,
        outputPath: outputPath,
        outputFilename: outputFilename,
        chapterCount: chapters.length
      };
    } catch (error) {
      console.error('Error converting DOCX to TXT:', error);
      return {
        success: false,
        message: error.message || 'Failed to convert DOCX file'
      };
    }
  });
  // Convert TXT to DOCX - using minimal, version-compatible approach
  ipcMain.handle('convert-txt-to-docx', async (event, txtPath, outputFilename) => {
    try {
      // Ensure we have a current project
      if (!appState.CURRENT_PROJECT_PATH) {
        return {
          success: false,
          message: 'No active project selected'
        };
      }
      
      // Validate output filename
      if (!outputFilename) {
        outputFilename = 'manuscript.docx';
      }
      
      // Ensure it has a .docx extension
      if (!outputFilename.toLowerCase().endsWith('.docx')) {
        outputFilename += '.docx';
      }
      
      // Construct output path
      const outputPath = path.join(appState.CURRENT_PROJECT_PATH, outputFilename);
      
      // Read the txt file
      const textContent = await fs.promises.readFile(txtPath, 'utf8');
      
      // Import docx library
      const docx = require('docx');
      
      // Split text into paragraphs (separated by empty lines)
      const paragraphs = textContent.split(/\n\s*\n/).map(p => p.trim()).filter(p => p);
      
      // Simple function to check if a paragraph looks like a chapter heading
      function isChapterTitle(text) {
        // Common chapter title patterns
        return /^chapter\s+\d+/i.test(text) || // "Chapter X"
               /^chapter\s+[ivxlcdm]+/i.test(text) || // "Chapter IV"
               /^\d+[\.:]\s+/i.test(text); // "1: " or "1. "
      }

      // Create array of document content
      const children = [];
      let chapterCount = 0;
      
      // Process each paragraph
      paragraphs.forEach((paragraph, index) => {
        // Test if it's a chapter title
        if (isChapterTitle(paragraph)) {
          chapterCount++;
          
          // Add page break before chapters (except the first one)
          if (chapterCount > 1) {
            children.push(new docx.Paragraph({ pageBreakBefore: true }));
          }
          
          // Add chapter heading with proper formatting
          children.push(
            new docx.Paragraph({
              text: paragraph,
              heading: docx.HeadingLevel.HEADING_1,
              alignment: docx.AlignmentType.CENTER,
              spacing: { before: 240, after: 120 }
            })
          );
        } else {
          // Regular paragraph with first line indent
          children.push(
            new docx.Paragraph({
              text: paragraph,
              indent: { firstLine: 720 }, // 0.5 inch
              spacing: { line: 480 } // Double spacing
            })
          );
        }
      });

      // Create document with minimal options
      const doc = new docx.Document({
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: 1440, // 1 inch (1440 twips)
                  right: 1440, 
                  bottom: 1440,
                  left: 1440
                }
              }
            },
            children: children
          }
        ]
      });
      
      // Save the document
      const buffer = await docx.Packer.toBuffer(doc);
      await fs.promises.writeFile(outputPath, buffer);
      
      return {
        success: true,
        outputPath: outputPath,
        outputFilename: outputFilename,
        chapterCount: chapterCount,
        paragraphCount: paragraphs.length
      };
    } catch (error) {
      console.error('Error converting TXT to DOCX:', error);
      return {
        success: false,
        message: error.message || 'Failed to convert TXT file'
      };
    }
  });

  // Get output files for a tool run
  ipcMain.handle('get-tool-output-files', (event, toolId) => {
    try {
      // For simplicity, if toolId is a runId, we just use the tool name part
      // This assumes runIds are in the format toolName-uuid
      const toolName = toolId.includes('-') ? toolId.split('-')[0] : toolId;
      
      // Get files from the cache
      const fileCache = require('./file-cache');
      const files = fileCache.getFiles(toolName);
      
      return files;
    } catch (error) {
      console.error('Error getting tool output files:', error);
      return [];
    }
  });
}

// Quit when all windows are closed
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', async (event) => {
  console.log('Application is quitting, cleaning up resources...');
  // Close any active Claude API clients
  for (const toolId of toolSystem.toolRegistry.getAllToolIds()) {
    const tool = toolSystem.toolRegistry.getTool(toolId);
    if (tool && tool.GeminiAPIService) {
      try {
        tool.GeminiAPIService.close();
      } catch (error) {
        // Ignore close errors during shutdown
      } finally {
        tool.GeminiAPIService = null;
      }
    }
  }
});
