// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');

const hiss = require('./hiss-node.js').hiss;
const HT = hiss.HissTools;
const hval = hiss.HissTools.toHValue;
const string = hiss.HissTools.toHaxeString;
const first = hiss.HissTools.first;

var interp = null;

function freshInterpreter() {
	interp = new hiss.CCInterp(
		// (print) via message box
		function (v) {
			vscode.window.showInformationMessage(HT.toPrint(hval(v))); return v;
		});

	// (read-line) via input box
	interp.importCCFunction(function(_, _, cc) {
		vscode.window.showInputBox().then(function(input) {
			cc(hval(input));
		}, function (err) {
			vscode.window.showInformationMessage("read-line failed with " + err.toString());
		});
	}, "read-line");

	// (input-string [prompt]) via input box
	interp.importCCFunction(function(args, _, cc) {
		var prompt = "";
		if (hiss.HissTools.truthy(args)) {
			prompt = string(hiss.HissTools.first(args));
		}
		vscode.window.showInputBox({
			"prompt": prompt
		}).then(function(input) {
			cc(hval(input));
		}, function (err) {
			vscode.window.showInformationMessage("input-string failed with " + err.toString());
		});
	}, "input-string");

	// (insert [expression])
	interp.importCCFunction(function(args, env, cc) {
		var arg = hiss.HissTools.first(args);
		var toInsert = hiss.HissTools.toMessage(arg);
		if (vscode.window.activeTextEditor) {
			vscode.window.activeTextEditor.edit(function(edit) {
				edit.replace(vscode.window.activeTextEditor.selection, toInsert);
				cc(hval(arg));
			});
		} else {
			vscode.window.showInformationMessage("You need to select an editor before inserting.");
		}

	}, "insert");

	// Load the user's launch script
	var config = vscode.workspace.getConfiguration('hiss-vscode');

	var launchScript = config.get("launchScript");
	if (launchScript != null) {
		interp.load(launchScript);
	}

	// Run hiss with continuations enabled to handle async
	runHiss("(enable-continuations)");
}

function runHiss(code) {
	interp.eval(interp.read(code));
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	freshInterpreter();

	// Display the value of a Hiss expression
	let eval = vscode.commands.registerCommand('hiss-vscode.eval', function () {
		runHiss("(print (input-expression \"Expression to evaluate:\"))");
	});

	// Insert the value of a Hiss expression
	let insert = vscode.commands.registerCommand('hiss-vscode.insert', function () {		
		runHiss("(insert (input-expression \"Expression to insert:\"))");
	});

	// Restart the interpreter to clear state
	let restart = vscode.commands.registerCommand('hiss-vscode.restart', freshInterpreter);

	context.subscriptions.push(eval);
	context.subscriptions.push(insert);
	context.subscriptions.push(restart);
}
exports.activate = activate;

function deactivate() {}

module.exports = {
	activate,
	deactivate
}