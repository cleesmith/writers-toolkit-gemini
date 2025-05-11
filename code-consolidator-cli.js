#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const inquirer = require('inquirer');
const glob = require('glob');
const chalk = require('chalk');
const cliProgress = require('cli-progress');

console.log(chalk.blue.bold('\n📦 CODE CONSOLIDATOR 📦'));
console.log(chalk.blue('Prepare your codebase for AI analysis\n'));

// Main function
async function main() {
  try {
    // Get user input through a series of questions
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'rootDir',
        message: 'What directory contains your codebase?',
        default: '.',
        validate: (input) => {
          return fs.existsSync(input) ? true : 'Directory does not exist!';
        }
      },
      {
        type: 'input',
        name: 'fileTypes',
        message: 'What file extensions do you want to include? (comma separated)',
        default: 'js,jsx,ts,tsx,html,css,json',
        validate: (input) => {
          return input.length > 0 ? true : 'Please specify at least one file extension';
        }
      },
      {
        type: 'input',
        name: 'excludeDirs',
        message: 'Directories to exclude? (comma separated)',
        default: 'node_modules,.git,dist,build,out',
        validate: (input) => {
          return input.length > 0 ? true : 'Please specify at least one directory to exclude';
        }
      },
      {
        type: 'input',
        name: 'excludeFiles',
        message: 'Specific files to exclude? (comma separated)',
        default: 'package-lock.json',
      },
      {
        type: 'input',
        name: 'outputFile',
        message: 'Output filename:',
        default: 'codebase_for_ai.txt'
      },
      {
        type: 'list',
        name: 'delimiter',
        message: 'Choose a file delimiter style:',
        choices: [
          { name: 'Standard (===== FILE: path =====)', value: 'standard' },
          { name: 'Markdown (## FILE: path)', value: 'markdown' },
          { name: 'Detailed (File info + Language + Size)', value: 'detailed' }
        ]
      },
      {
        type: 'confirm',
        name: 'includeTOC',
        message: 'Include a table of contents at the beginning?',
        default: true
      }
    ]);

    // Process the answers
    const fileExtensions = answers.fileTypes.split(',').map(ext => ext.trim().replace(/^\./, ''));
    const excludeDirs = answers.excludeDirs.split(',').map(dir => dir.trim());
    
    // Process excluded files
    const excludeFiles = answers.excludeFiles.split(',')
      .map(file => file.trim())
      .filter(file => file.length > 0);
    
    // Create ignore patterns for directories
    const ignorePatterns = excludeDirs.map(dir => `**/${dir}/**`);
    
    console.log(chalk.yellow('\nSearching for files...'));
    
    // Find all matching files - fix the pattern issue by using multiple glob calls
    let files = [];
    
    // Process each extension separately
    for (const ext of fileExtensions) {
      const pattern = `**/*.${ext}`;
      
      const extFiles = await new Promise((resolve, reject) => {
        glob(pattern, {
          cwd: answers.rootDir,
          ignore: ignorePatterns,
          nodir: true
        }, (err, matchedFiles) => {
          if (err) reject(err);
          else resolve(matchedFiles);
        });
      });
      
      files = [...files, ...extFiles];
    }
    
    // Remove any duplicates that might have occurred
    files = [...new Set(files)];
    
    // Filter out specific excluded files
    if (excludeFiles.length > 0) {
      const originalCount = files.length;
      
      files = files.filter(file => {
        const fileName = path.basename(file);
        return !excludeFiles.includes(fileName);
      });
      
      const excludedCount = originalCount - files.length;
      if (excludedCount > 0) {
        console.log(chalk.yellow(`Excluded ${excludedCount} specific file(s) by name.`));
      }
    }
    
    if (files.length === 0) {
      console.log(chalk.red('No matching files found!'));
      return;
    }
    
    console.log(chalk.green(`Found ${files.length} files to process.`));
    
    // Create the output file
    const outputPath = path.resolve(answers.outputFile);
    
    // Initialize progress bar
    const progressBar = new cliProgress.SingleBar({
      format: 'Processing files |' + chalk.cyan('{bar}') + '| {percentage}% | {value}/{total} files',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
    }, cliProgress.Presets.shades_classic);
    
    // Begin processing
    progressBar.start(files.length, 0);
    
    // Create a table of contents if requested
    let tableOfContents = '';
    if (answers.includeTOC) {
      tableOfContents = '# TABLE OF CONTENTS\n\n';
      files.forEach((file, index) => {
        tableOfContents += `${index + 1}. ${file}\n`;
      });
      tableOfContents += '\n\n';
    }
    
    // Write the table of contents
    fs.writeFileSync(outputPath, tableOfContents);
    
    // Process each file
    let totalBytes = 0;
    let fileStats = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filePath = path.join(answers.rootDir, file);
      
      try {
        // Read the file
        const content = fs.readFileSync(filePath, 'utf8');
        const stats = fs.statSync(filePath);
        const fileSize = stats.size;
        totalBytes += fileSize;
        
        // Store stats for summary
        fileStats.push({
          path: file,
          size: fileSize,
          extension: path.extname(file).replace('.', '')
        });
        
        // Create the delimiter based on user choice
        let delimiter;
        switch (answers.delimiter) {
          case 'markdown':
            delimiter = `\n\n## FILE: ${file}\n\n`;
            break;
          case 'detailed':
            delimiter = `\n\n${'='.repeat(60)}\n`;
            delimiter += `FILE: ${file}\n`;
            delimiter += `SIZE: ${fileSize} bytes\n`;
            delimiter += `LANGUAGE: ${path.extname(file).replace('.', '').toUpperCase()}\n`;
            delimiter += `${'='.repeat(60)}\n\n`;
            break;
          default: // standard
            delimiter = `\n\n${'='.repeat(20)} FILE: ${file} ${'='.repeat(20)}\n\n`;
        }
        
        // Append to the output file
        fs.appendFileSync(outputPath, delimiter + content);
        
        // Update progress
        progressBar.update(i + 1);
      } catch (error) {
        console.error(`\nError processing ${file}: ${error.message}`);
      }
    }
    
    progressBar.stop();
    
    // Generate summary
    console.log(chalk.green(`\n✅ Successfully created ${answers.outputFile}`));
    console.log(chalk.yellow(`Total size: ${formatBytes(totalBytes)}`));
    
    // Group files by extension for summary
    const extensionStats = {};
    fileStats.forEach(file => {
      if (!extensionStats[file.extension]) {
        extensionStats[file.extension] = { count: 0, size: 0 };
      }
      extensionStats[file.extension].count++;
      extensionStats[file.extension].size += file.size;
    });
    
    console.log(chalk.yellow('\nFile Types Summary:'));
    Object.keys(extensionStats).forEach(ext => {
      const stats = extensionStats[ext];
      console.log(`  ${chalk.cyan(ext.toUpperCase())}: ${stats.count} files (${formatBytes(stats.size)})`);
    });
    
    console.log(chalk.blue(`\nYour codebase is now ready for AI analysis! 🚀`));
    
  } catch (error) {
    console.error(chalk.red(`\nAn error occurred: ${error.message}`));
  }
}

// Helper function to format bytes
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Run the main function
main();
