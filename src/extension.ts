// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';

export interface MapperXmlLocation {
	targetLine: number;
	startChar: number;
}

export interface MapperXmlFile {
	path: string;
	text: string;
}

export interface MapperXmlMatch {
	file: MapperXmlFile;
	location: MapperXmlLocation;
	namespaceRank: number;
	directoryMatchCount: number;
	fileNameMatchesClass: boolean;
}

function getJavaClassName(fileName: string): string | null {
	const parsedPath = path.parse(fileName);
	return parsedPath.ext === '.java' ? parsedPath.name : null;
}

function getJavaPackageName(javaText: string): string | null {
	const packageMatch = javaText.match(/^\s*package\s+([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*)\s*;/m);
	return packageMatch ? packageMatch[1] : null;
}

function getNamespaceRank(xmlText: string, className: string, fullyQualifiedClassName: string | null): number {
	const namespaceMatch = xmlText.match(/<mapper\b[^>]*\bnamespace\s*=\s*["']([^"']+)["']/);
	if (!namespaceMatch) {
		return 3;
	}

	const namespace = namespaceMatch[1];
	if (fullyQualifiedClassName && namespace === fullyQualifiedClassName) {
		return 0;
	}

	if (namespace === className || namespace.endsWith(`.${className}`)) {
		return 1;
	}

	return 4;
}

function getDirectoryMatchCount(firstDir: string, secondDir: string): number {
	const firstComponents = firstDir.split(/[\\/]/);
	const secondComponents = secondDir.split(/[\\/]/);
	let matchCount = 0;

	for (let i = 0; i < Math.min(firstComponents.length, secondComponents.length); i++) {
		if (firstComponents[i] !== secondComponents[i]) {
			break;
		}
		matchCount++;
	}

	return matchCount;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function findMethodIdInXml(xmlText: string, methodName: string): MapperXmlLocation | undefined {
	const idPattern = new RegExp(`\\bid\\s*=\\s*["']${escapeRegExp(methodName)}["']`);
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

export function findBestMapperXmlMatch(javaFileName: string, javaText: string, methodName: string, xmlFiles: MapperXmlFile[]): MapperXmlMatch | null {
	const className = getJavaClassName(javaFileName);
	if (!className) {
		return null;
	}

	const javaFileDir = path.dirname(javaFileName);
	const packageName = getJavaPackageName(javaText);
	const fullyQualifiedClassName = packageName ? `${packageName}.${className}` : null;
	const matches: MapperXmlMatch[] = [];

	for (const xmlFile of xmlFiles) {
		const location = findMethodIdInXml(xmlFile.text, methodName);

		if (!location) {
			continue;
		}

		matches.push({
			file: xmlFile,
			location,
			namespaceRank: getNamespaceRank(xmlFile.text, className, fullyQualifiedClassName),
			directoryMatchCount: getDirectoryMatchCount(path.dirname(xmlFile.path), javaFileDir),
			fileNameMatchesClass: path.parse(xmlFile.path).name === className,
		});
	}

	if (matches.length === 0) {
		return null;
	}

	matches.sort((a, b) => {
		if (a.namespaceRank !== b.namespaceRank) {
			return a.namespaceRank - b.namespaceRank;
		}

		if (a.fileNameMatchesClass !== b.fileNameMatchesClass) {
			return a.fileNameMatchesClass ? -1 : 1;
		}

		return b.directoryMatchCount - a.directoryMatchCount;
	});

	return matches[0];
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

		const javaText = document.getText();

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

		// Search all XML files so mapper XMLs can use names that differ from the Java mapper file.
		const xmlFiles = await vscode.workspace.findFiles('**/*.xml', '**/{node_modules,out,dist,build,target}/**');
		if (!xmlFiles || xmlFiles.length === 0) {
			vscode.window.showWarningMessage('No XML files found in workspace.');
			return;
		}

		const mapperXmlFiles: MapperXmlFile[] = [];
		const xmlDocuments = new Map<string, vscode.TextDocument>();
		for (const xmlUri of xmlFiles) {
			const xmlDoc = await vscode.workspace.openTextDocument(xmlUri);
			const xmlPath = xmlUri.path;
			mapperXmlFiles.push({
				path: xmlPath,
				text: xmlDoc.getText(),
			});
			xmlDocuments.set(xmlPath, xmlDoc);
		}

		const targetMatch = findBestMapperXmlMatch(fileName, javaText, methodName, mapperXmlFiles);
		if (!targetMatch) {
			vscode.window.showWarningMessage(`No id="${methodName}" found in any XML file.`);
			return;
		}

		const targetXmlDoc = xmlDocuments.get(targetMatch.file.path);
		if (!targetXmlDoc) {
			return;
		}

		// Open the XML file and reveal the line
		const xmlEditor = await vscode.window.showTextDocument(targetXmlDoc, { preview: false });
		const range = new vscode.Range(
			targetMatch.location.targetLine,
			targetMatch.location.startChar,
			targetMatch.location.targetLine,
			targetMatch.location.startChar + methodName.length
		);
		xmlEditor.selection = new vscode.Selection(range.start, range.end);
		xmlEditor.revealRange(range, vscode.TextEditorRevealType.InCenter);
	});
	
	context.subscriptions.push(goMapperDefinition);
}

// This method is called when your extension is deactivated
export function deactivate() {}
