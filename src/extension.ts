// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';

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

		// Search for the XML file in the workspace
		const xmlFiles = await vscode.workspace.findFiles(`**/${className}.xml`);
		if (!xmlFiles || xmlFiles.length === 0) {
			vscode.window.showWarningMessage(`${className}.xml not found in workspace.`);
			return;
		}

		// Get current Java file directory path
		const javaFileDir = path.dirname(fileName);

		// Sort XML files by directory proximity (closest first)
		xmlFiles.sort((a, b) => {
			const aDir = path.dirname(a.path);
			const bDir = path.dirname(b.path);

			// Split paths into components, handling both Windows and Unix separators
			const aComponents = aDir.split(/[\\/]/);
			const bComponents = bDir.split(/[\\/]/);
			const javaComponents = javaFileDir.split(/[\\/]/);

			// Calculate longest common prefix with Java file directory
			let aMatchCount = 0;
			let bMatchCount = 0;

			for (let i = 0; i < Math.min(aComponents.length, javaComponents.length); i++) {
				if (aComponents[i] === javaComponents[i]) {
					aMatchCount++;
				} else {
					break;
				}
			}

			for (let i = 0; i < Math.min(bComponents.length, javaComponents.length); i++) {
				if (bComponents[i] === javaComponents[i]) {
					bMatchCount++;
				} else {
					break;
				}
			}

			// Sort in descending order (closest first)
			return bMatchCount - aMatchCount;
		});

		// Search for the method in the sorted XML files
		let found = false;
		let targetXmlUri: vscode.Uri | null = null;
		let targetLine = -1;
		let targetXmlDoc: vscode.TextDocument | null = null;
		let xmlText: string | null = null;
		let lines: string[] = [];

		for (const xmlUri of xmlFiles) {
			const xmlDoc = await vscode.workspace.openTextDocument(xmlUri);
			const text = xmlDoc.getText();
			const fileLines = text.split(/\r?\n/);

			// Search for id="<methodName>"
			const idPattern = new RegExp(`id=["']${methodName}["']`);
			for (let i = 0; i < fileLines.length; i++) {
				if (idPattern.test(fileLines[i])) {
					found = true;
					targetXmlUri = xmlUri;
					targetLine = i;
					targetXmlDoc = xmlDoc;
					xmlText = text;
					lines = fileLines;
					break;
				}
			}

			if (found) {
				break;
			}
		}

		if (!found || targetLine === -1 || !targetXmlUri || !targetXmlDoc || !xmlText) {
			vscode.window.showWarningMessage(`No id="${methodName}" found in any ${className}.xml file.`);
			return;
		}

		// Open the XML file and reveal the line
		const xmlEditor = await vscode.window.showTextDocument(targetXmlDoc, { preview: false });
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
