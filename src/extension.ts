// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { log } from 'console';
import exp from 'constants';
import { open } from 'fs';
import * as vscode from 'vscode';
import xmldoc from 'xmldoc';

// 内部定义的通信消息
interface Message {
	type: string;
	value: string;
	// 是否重载整个web页面
	reload: boolean;
}

class DuiLibPreview {
	vsCodeContext : vscode.ExtensionContext;
	lastPannel : vscode.WebviewPanel | undefined;
	lastContent: string | undefined;

	constructor(context: vscode.ExtensionContext) {
		this.vsCodeContext = context;
		const lodash = require('lodash');
		let debounced = lodash.debounce((e: any) => this.debouncedOpenWebView(e), 250);

		// 监听xml文本输入变化
		vscode.workspace.onDidChangeTextDocument( (e) => {
			debounced(e);
		});

		// 监听选择的文件变化
		vscode.window.onDidChangeActiveTextEditor((e) => {
			const document = e?.document;
			if (document && document.languageId == 'xml') {
				this.openWebview(e.document.getText());
			}
		});
	}

	// 输入文本防抖
	debouncedOpenWebView(e: vscode.TextDocumentChangeEvent) {
		const document = e.document;
		if (document && document.languageId == 'xml') {
			this.openWebview(e.document.getText());
		}
	}

	// VSCode xml 文件右键
	onDuiLibPreviewXmlCmd(uri: vscode.Uri) {
		const fs = require("fs");
		// Read file from VSCode right menu
		this.openWebview(fs.readFileSync(uri.fsPath))
	}

	// 执行命令行，将xml转换成png图片，从标准输出中读取图片
	execDuiLibToPng(xmlData: string) : string {
		const { execSync } = require('child_process');
	 
		// 要执行的命令及其参数	
		const pluginRoot = this.vsCodeContext.extensionUri.fsPath;
		const rootDir = vscode.workspace.workspaceFolders?.at(0);
	
		const language = this.getLanguage();
		const buttonState = this.getButtonState();
	
		const command = `${pluginRoot}\\XMLToPng.exe --button_state=${buttonState} --language=${language} --skin_path=${rootDir?.uri.fsPath}\\`;
	
		const result = execSync(command, {
			input: xmlData
		});
	
		return result;
	}

	openWebview(content: string) {
		// 保存上次的东西，以便于重启
		this.lastContent = content;

		let document = new xmldoc.XmlDocument(content);
	
		// 默认为xml添加上style.xml，这样可以展示出来样式
		let styleNode = new xmldoc.XmlDocument(`<Include source="style.xml"/>`);
		document.children.unshift(styleNode);
		content = document.toString();
	
		// 将xml转换成PNG图片的base64编码
		const data = "data:image/png;base64," + this.execDuiLibToPng(content);
		if (!this.lastPannel) {
			this.lastPannel = vscode.window.createWebviewPanel(
				"DuiLibPreview",
				"DuiLib Preview",
				{
					viewColumn: vscode.ViewColumn.Two,
					preserveFocus: true
				},
				{
				}
			);
			this.lastPannel.onDidDispose(()=> {
				this.lastPannel = undefined;
			}, null);
			this.lastPannel.webview.options = {
				enableScripts: true
			};
			this.lastPannel.webview.onDidReceiveMessage((e) => this.onDidRecieveMessage(e));
		} else {
		}
	
		// 设置HTML内容
		this.lastPannel.webview.html = this.getWebviewContent(data);
	}

	// 页面上发送过来的消息，将内容保存在VSCode中
	onDidRecieveMessage(e: any) {
		let message = e as Message;
		this.vsCodeContext.globalState.update(message.type, message.value);
		// 有的设置项需重载页面绘制
		if (message.reload) {
			this.openWebview(this.lastContent!);
		}
	}
	
	// 获取语言
	getLanguage() {
		let command = this.vsCodeContext.globalState.get("language");
		if (!command) {
			command = "";
		}
		return command;
	}
	
	// 获取背景色
	getBkColor() {
		let bkcolor = this.vsCodeContext.globalState.get("bkcolor");
		if (!bkcolor) {
			bkcolor = "";
		}
		return bkcolor;
	}
	
	// 获取按钮状态
	getButtonState() {
		let buttonState = this.vsCodeContext.globalState.get("buttonState");
		if (!buttonState) {
			buttonState = "normal";
		}
		return buttonState;
	}
	
	// 打开web页面，将图片以base64的方式打开，并且将用户上次设置的语言、背景色和按钮状态也一并传递给页面
	getWebviewContent(content: string) {
		let language = this.getLanguage();
		let bkcolor = this.getBkColor();
		let buttonState = this.getButtonState();
	
		return `<!DOCTYPE html>
		<html lang="en">
		<head>
		  <meta charset="UTF-8" />
		  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
		  <title>DuiLib Preview</title>
		  <style>
			html,
			body {
			  width: 100%;
			  height: 100%;
			}
			.img_host {
			  display: flex;
			  width:100%;
			  height:90%;
			  align-items: center;
			  justify-content: center;
			}
			.options_header {
			  width:100%;
			  height:10%;
			}
		  </style>
		  <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
		  <script>
			$(document).ready(()=> {
				$("body").css("background-color", "${bkcolor}");
	
				var vscode = acquireVsCodeApi();
	
				var inputCommand = $("#inputCommand");
				inputCommand.keypress(function(e){
					var key=e.which;
					if(key==13){
						vscode.postMessage({
							type: "language",
							value: inputCommand.val(),
							reload: true
						});
					}
				});
		
				var inputBackground = $("#inputBackground");
				inputBackground.keypress(function(e){
					var key = e.which;
					if(key==13){
						$("body").css("background-color", inputBackground.val());
						vscode.postMessage({
							type: "bkcolor",
							value: inputBackground.val(),
							reload: false
						});
					}
				});
		
				var btnStateSelect = $("#btnStateSelect");
				btnStateSelect.change(function() {
					console.log(btnStateSelect.val());
					vscode.postMessage({
						type: "buttonState",
						value: btnStateSelect.val(),
						reload: true
					});
				});
	
				var selectval = document.getElementById("selectval").value;
				var options = document.getElementById("btnStateSelect");
				for (i = 0; i < options.length; ++i) {
					if (options[i].value == selectval) {
						options[i].selected = true;
					}
				}
			});
			
		  </script>
		</head>
		<body>
			<div class="options_header">
				语言: <input id="inputCommand" value="${language}" placeholder="输入语言xml名即可"/>
				&nbsp;&nbsp;背景颜色: <input id="inputBackground" value="${bkcolor}" placeholder="输入css风格颜色"/>
				&nbsp;&nbsp;选择按钮状态: 
				<select id="btnStateSelect">
					<option value="normal">普通</option>
					<option value="hover">高亮</option>
					<option value="push">按下</option>
					<option value="disable">禁用</option>
					<option value="select">option选中</option>
				</select>
				<input type="hidden" value="${buttonState}" id="selectval"/>
			</div>
			<div class="img_host">
				<img src="${content}"/>
			</div>
		</body>
		</html>
		  `;
	}	
}

let duiLibPreview : DuiLibPreview;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	duiLibPreview = new DuiLibPreview(context);

	let disposable = vscode.commands.registerCommand('duilib_preview_xml', (uri) => {

		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('duilib_preview from DuiLibUIPreview!');
		duiLibPreview.onDuiLibPreviewXmlCmd(uri);
	});
	
	context.subscriptions.push(disposable);	
}

// This method is called when your extension is deactivated
export function deactivate() {
}
