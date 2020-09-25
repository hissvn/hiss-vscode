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
				var firstArg = first(args);
				if (HT.truthy(firstArg)) {
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

		// (make-range [start] [end])
		interp.importFunction((start, end) => {
			return new vscode.Range(start, end);
		}, "make-range");

		// The rest of the API is defined in api.hiss using the module object
		interp.importVar(vscode, "vscode");

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
						sel)))\
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

	// Restart the interpreter to clear state
	let restart = commands.registerCommand('hiss-vscode.restart', freshInterpreter);

	context.subscriptions.push(eval);
	context.subscriptions.push(insert);
	context.subscriptions.push(restart);

	freshInterpreter();
}
exports.activate = activate;

function deactivate() {}

module.exports = {
	activate,
	deactivate
}