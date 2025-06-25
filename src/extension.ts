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
			return;
		}
		const methodName = methodMatch[2];

		// Search for the XML file in the workspace
		const xmlFiles = await vscode.workspace.findFiles(`**/${className}.xml`, '**/node_modules/**', 1);
		if (!xmlFiles || xmlFiles.length === 0) {
			vscode.window.showWarningMessage(`${className}.xml not found in workspace.`);
			return;
		}

		const xmlUri = xmlFiles[0];
		const xmlDoc = await vscode.workspace.openTextDocument(xmlUri);
		const xmlText = xmlDoc.getText();
		const lines = xmlText.split(/\r?\n/);

		// Search for id="<methodName>"
		const idPattern = new RegExp(`id=["']${methodName}["']`);
		let targetLine = -1;
		for (let i = 0; i < lines.length; i++) {
			if (idPattern.test(lines[i])) {
				targetLine = i;
				break;
			}
		}

		if (targetLine === -1) {
			vscode.window.showWarningMessage(`No <id="${methodName}"> found in ${className}.xml.`);
			return;
		}

		// Open the XML file and reveal the line
		const xmlEditor = await vscode.window.showTextDocument(xmlDoc, { preview: false });
		const range = new vscode.Range(targetLine, 0, targetLine, 0);
		xmlEditor.selection = new vscode.Selection(range.start, range.end);
		xmlEditor.revealRange(range, vscode.TextEditorRevealType.InCenter);
	});
	
	context.subscriptions.push(goMapperDefinition);
}

// This method is called when your extension is deactivated
export function deactivate() {}
