// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const commands = vscode.commands;
const infoMessage = vscode.window.showInformationMessage;
const errorMessage = vscode.window.showErrorMessage;
const inputBox = vscode.window.showInputBox;

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
		}, "read-line");

		// (input-string [prompt]) via input box
		interp.importCCFunction((args, env, cc) => {
			var prompt = "";
			if (HT.truthy(args)) {
				prompt = string(first(args));
			}
			inputBox({
				"prompt": prompt
			}).then((input) => {
				cc(hval(input));
			}, (err) => {
				errorMessage("input-string failed with " + err.toString());
			});
		}, "input-string");

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

		}, "insert");

		// (vscode-command [command name])
		interp.importCCFunction((args, env, cc) => {
			commands.executeCommand(string(first(args))).then((result) => {
				cc(hval(result));
			}, (err) => {
				errorMessage(err.toString());
			});
		}, "vscode-command");

		// Load the user's launch script
		var config = vscode.workspace.getConfiguration('hiss-vscode');

		var launchScript = config.get("launchScript");
		if (launchScript != null) {
			interp.load(launchScript);
		}

		// Run hiss with continuations enabled to handle async
		resolve(runHissExp("(enable-continuations)"));
	});
}

/**
 * 
 * @param {String} code Hiss code to evaluate
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
	// Display the value of a Hiss expression
	let eval = commands.registerCommand('hiss-vscode.eval', () => {
		return runHissExp("(print (input-expression \"Expression to evaluate:\"))");
	});

	// Insert the value of a Hiss expression
	let insert = commands.registerCommand('hiss-vscode.insert', () => {		
		return runHissExp("(insert (input-expression \"Expression to insert:\"))");
	});

	// Restart the interpreter to clear state
	let restart = commands.registerCommand('hiss-vscode.restart', freshInterpreter);

	context.subscriptions.push(eval);
	context.subscriptions.push(insert);
	context.subscriptions.push(restart);

	freshInterpreter().then(() => {
		infoMessage("Hiss-vscode is ready.");
	});
}
exports.activate = activate;

function deactivate() {}

module.exports = {
	activate,
	deactivate
}