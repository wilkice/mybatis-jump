// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	const goMapperDefinition = vscode.commands.registerCommand('mybatis-jump-mapper-xml.goMapperDefinition', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return;
		}

		const document = editor.document;
		const fileName = document.fileName;
		// Only proceed if this is a Java file
		if (!fileName.endsWith('.java')) {
			return;
		}

		// Get class name from file name
		const classNameMatch = fileName.match(/([^\/\\]+)\.java$/);
		if (!classNameMatch) {
			return;
		}
		const className = classNameMatch[1];

		// Get the current line text
		const position = editor.selection.active;
		const lineText = document.lineAt(position.line).text;

		// Try to match a Java method declaration (simple regex)
		// e.g., public User getUserByCountry(...
		const methodRegex = /\b([a-zA-Z0-9_<>\[\]]+)\s+([a-zA-Z0-9_]+)\s*\(/;
		const methodMatch = lineText.match(methodRegex);
		if (!methodMatch) {
			// Not on a method line
			vscode.window.showWarningMessage(`Not on a method line: ${lineText}`);
			return;
		}
		const methodName = methodMatch[2];

		// Search for all XML files with the same name in the workspace
		const xmlFiles = await vscode.workspace.findFiles(`**/${className}.xml`, '**/node_modules/**');
		if (!xmlFiles || xmlFiles.length === 0) {
			vscode.window.showWarningMessage(`${className}.xml not found in workspace.`);
			return;
		}

		// Calculate path similarity for each XML file and sort by similarity
		const javaFilePath = fileName;
		const javaSegments = javaFilePath.split(/[\/\\]/);

		const filesWithSimilarity = xmlFiles.map(xmlUri => {
			const xmlPath = xmlUri.fsPath;
			const xmlSegments = xmlPath.split(/[\/\\]/);

			// Count consecutive matching segments from the beginning
			let similarity = 0;
			const minLength = Math.min(javaSegments.length, xmlSegments.length);
			for (let i = 0; i < minLength; i++) {
				if (javaSegments[i] === xmlSegments[i]) {
					similarity++;
				} else {
					break;
				}
			}

			return { uri: xmlUri, similarity };
		});

		// Sort by similarity score (descending)
		filesWithSimilarity.sort((a, b) => b.similarity - a.similarity);

		// Search files sequentially until a match is found
		const idPattern = new RegExp(`id=["']${methodName}["']`);
		let foundFile: vscode.Uri | null = null;
		let targetLine = -1;
		let xmlDoc: vscode.TextDocument | null = null;
		let lines: string[] = [];

		for (const fileInfo of filesWithSimilarity) {
			const doc = await vscode.workspace.openTextDocument(fileInfo.uri);
			const text = doc.getText();
			const fileLines = text.split(/\r?\n/);

			// Search for the method ID pattern
			for (let i = 0; i < fileLines.length; i++) {
				if (idPattern.test(fileLines[i])) {
					foundFile = fileInfo.uri;
					targetLine = i;
					xmlDoc = doc;
					lines = fileLines;
					break;
				}
			}

			// Early exit if match found
			if (foundFile) {
				break;
			}
		}

		if (!foundFile || targetLine === -1 || !xmlDoc) {
			vscode.window.showWarningMessage(`No id="${methodName}" found in ${className}.xml (searched ${filesWithSimilarity.length} file(s))`);
			return;
		}

		// Open the XML file and reveal the line
		const xmlEditor = await vscode.window.showTextDocument(xmlDoc!, { preview: false });
		const lineTextInXml = lines[targetLine];
		const idMatch = lineTextInXml.match(/id=["']([^"']+)["']/);
		let startChar = 0;
		if (idMatch && idMatch.index !== undefined) {
			// Find the start index of the method name (id property value)
			const idValueIndex = lineTextInXml.indexOf(methodName);
			if (idValueIndex !== -1) {
				startChar = idValueIndex;
			}
		}
		const range = new vscode.Range(targetLine, startChar, targetLine, startChar + methodName.length);
		xmlEditor.selection = new vscode.Selection(range.start, range.end);
		xmlEditor.revealRange(range, vscode.TextEditorRevealType.InCenter);
	});
	
	context.subscriptions.push(goMapperDefinition);
}

// This method is called when your extension is deactivated
export function deactivate() {}
