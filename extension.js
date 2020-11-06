// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const commands = vscode.commands;
var window = vscode.window;
const infoMessage = window.showInformationMessage;
const errorMessage = window.showErrorMessage;
const inputBox = window.showInputBox;

const fs = require('fs');
const path = require('path');

const hiss = require('./hiss-node.js').hiss;
const HT = hiss.HissTools;
const hval = HT.toHValue;
const string = HT.toHaxeString;
const first = HT.first;
const value = HT.value;

var interp = null;

function freshInterpreter() {
	return new Promise( (resolve, reject) => {
		interp = new hiss.CCInterp(
			// (print) via message box
			(v) => {
				infoMessage(HT.toPrint(hval(v))); return v;
			});

		// Handle errors by showing an error message box
		interp.setErrorHandler((error) => {
			errorMessage(error);
		});

		// (read-line) via input box
		interp.importCCFunction((args, env, cc) => {
			inputBox().then((input) => {
				cc(hval(input));
			}, (err) => {
				errorMessage("read-line failed with " + err.toString());
			});
		}, { name: "read-line" } );

		// (input-string [prompt]) via input box
		interp.importCCFunction((args, env, cc) => {
			var prompt = "";
			if (interp.truthy(args)) {
				var firstArg = first(args);
				if (interp.truthy(firstArg)) {
					prompt = string(firstArg);
				}
			}
			inputBox({
				"prompt": prompt
			}).then((input) => {
				cc(hval(input));
			}, (err) => {
				errorMessage("input-string failed with " + err.toString());
			});
		}, { name: "input-string" });

		// (input-choice [choices] [prompt] [allow-multiple])
		interp.importCCFunction((args, env, cc) => {
			args = HT.toList(args);
			var choices = HT.toList(args[0]);
			var prompt = ""; if (args.length > 1) prompt = HT.toHaxeString(args[1]);
			var allowMultiple = false; if (args.length > 2) allowMultiple = interp.truthy(args[2]);

			var choiceStrings = choices.map(HT.toPrint);
			var dict = {};
			choiceStrings.forEach((key, i) => dict[key] = choices[i]);

			window.showQuickPick(choiceStrings, {
				canPickMany: allowMultiple,
				placeHolder: prompt
			}).then((result) => {
				if (allowMultiple) {
					var results = result.map((str) => dict[str]);
					cc(HT.toHValue(results));
				} else {
					cc(dict[result]);
				}
			}, (err) => {
				errorMessage(err.toString());
			});
		}, {name: "input-choice"});

		// (insert [expression])
		interp.importCCFunction((args, env, cc) => {
			var arg = first(args);
			var toInsert = HT.toMessage(arg);
			if (vscode.window.activeTextEditor) {
				vscode.window.activeTextEditor.edit((edit) => {
					edit.replace(vscode.window.activeTextEditor.selection, toInsert);
					cc(hval(arg));
				});
			} else {
				errorMessage("You need to select an editor before inserting.");
			}

		}, { name: "insert" });

		// (vscode-command [command name])
		interp.importCCFunction((args, env, cc) => {
			commands.executeCommand(string(first(args))).then((result) => {
				cc(hval(result));
			}, (err) => {
				errorMessage(err.toString());
			});
		}, {name: "vscode-command" });

		// (make-range [start] [end])
		interp.importFunction(vscode, (start, end) => {
			return new vscode.Range(start, end);
		}, { name: "make-range" });

		// Node modules
		interp.importVar(fs, "fs");

		interp.importFunction(path, path.basename, { name: "_base-name" });
		interp.importFunction(path, path.join, { name: "path-join" });
		interp.importFunction(path, path.dirname, { name: "_dir-name" });

		// Import any npm module to your environment
		interp.importFunction(undefined, require, { name: "require" });

		// Make javascript objects
		interp.importCCFunction((args, env, cc) => {
			var object = {};
			var argList = HT.unwrapList(args, interp);
			for (var idx = 0; idx < argList.length; idx += 2) {
				object[argList[idx]] = argList[idx+1];
			}
			cc(object);
		}, { name: "object" });

		// Many parts of the API can be defined in Hiss using reflection and the root module object
		interp.importVar(vscode, "vscode");

		// The rest of the API is defined in api.hiss
		interp.load(__dirname + "/api.hiss");

		// Load the user's launch script
		var config = vscode.workspace.getConfiguration('hiss-vscode');

		var launchScript = config.get("launchScript");
		if (launchScript != null) {
			try {
				interp.load(launchScript);
			} catch (err) {
				errorMessage("Failed to load user hiss-vscode configuration: " + err);
			}
		}

		// Run hiss with continuations enabled to handle async
		resolve(runHissExp("(enable-continuations)"));
	}).then(() => {
		infoMessage("Hiss-vscode is ready.");
	});;
}

/**
 * Run a Hiss expression
 * @param {String} code Hiss code to evaluate
 * @returns a Promise that resolves after the expression is evaluated
 */
function runHissExp(code) {
	return new Promise ( (resolve, reject) => {
		interp.evalCC(interp.read(code), (result) => {
			resolve(value(result, interp));
		});
	});
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	var sharedCode = "\
		(let (exp-str \
				(let (sel (selected-text))\
					(if (empty? sel)\
							(input-string \"Expression to {}:\")\
						\"(begin $sel)\")))\
			(when (not (empty? exp-str))\
				({} (eval (read exp-str)))))";

	// Display the value of a Hiss expression
	let eval = commands.registerCommand('hiss-vscode.eval', () => {
		return runHissExp(sharedCode.replace(/{}/g, "print"));
	});

	// Insert the value of a Hiss expression
	let insert = commands.registerCommand('hiss-vscode.insert', () => {		
		return runHissExp(sharedCode.replace(/{}/g, "insert"));
	});

	let command = commands.registerCommand('hiss-vscode.command', () => {
		runHissExp("(call-command)");
	});

	// Restart the interpreter to clear state
	let restart = commands.registerCommand('hiss-vscode.restart', freshInterpreter);

	context.subscriptions.push(eval);
	context.subscriptions.push(insert);
	context.subscriptions.push(command);
	context.subscriptions.push(restart);

	freshInterpreter();
}
exports.activate = activate;

function deactivate() {}

module.exports = {
	activate,
	deactivate
}