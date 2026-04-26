// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';

export interface MapperXmlLocation {
	targetLine: number;
	startChar: number;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function findMethodIdInXml(xmlText: string, methodName: string): MapperXmlLocation | undefined {
	const idPattern = new RegExp(`id=["']${escapeRegExp(methodName)}["']`);
	const lines = xmlText.split(/\r?\n/);

	for (let i = 0; i < lines.length; i++) {
		if (idPattern.test(lines[i])) {
			const startChar = lines[i].indexOf(methodName);
			return {
				targetLine: i,
				startChar: startChar === -1 ? 0 : startChar,
			};
		}
	}

	return undefined;
}

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
		let targetStartChar = 0;
		let targetXmlDoc: vscode.TextDocument | null = null;
		let xmlText: string | null = null;

		for (const xmlUri of xmlFiles) {
			const xmlDoc = await vscode.workspace.openTextDocument(xmlUri);
			const text = xmlDoc.getText();
			const location = findMethodIdInXml(text, methodName);

			if (location) {
				found = true;
				targetXmlUri = xmlUri;
				targetLine = location.targetLine;
				targetStartChar = location.startChar;
				targetXmlDoc = xmlDoc;
				xmlText = text;
				break;
			}
		}

		if (!found || targetLine === -1 || !targetXmlUri || !targetXmlDoc || !xmlText) {
			vscode.window.showWarningMessage(`No id="${methodName}" found in any ${className}.xml file.`);
			return;
		}

		// Open the XML file and reveal the line
		const xmlEditor = await vscode.window.showTextDocument(targetXmlDoc, { preview: false });
		const range = new vscode.Range(targetLine, targetStartChar, targetLine, targetStartChar + methodName.length);
		xmlEditor.selection = new vscode.Selection(range.start, range.end);
		xmlEditor.revealRange(range, vscode.TextEditorRevealType.InCenter);
	});
	
	context.subscriptions.push(goMapperDefinition);
}

// This method is called when your extension is deactivated
export function deactivate() {}
