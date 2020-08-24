// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');

const hiss = require('./hiss-node.js').hiss;

var interp = null;

function freshInterpreter() {
	interp = new hiss.CCInterp(function (v) {
		vscode.window.showInformationMessage(hiss.HissTools.toPrint(hiss.HissTools.toHValue(v))); return v; 
	});

	interp.importCCFunction(function(args, env, cc) {
		vscode.window.showInputBox().then(function(input) {
			cc(input);
		}, function (err) {
			vscode.window.showInformationMessage("read-line failed with " + err.toString());
			cc("");
		});
	}, "read-line");

	interp.importCCFunction(function(args, env, cc) {
		var arg = hiss.HissTools.first(args);
		var toInsert = hiss.HissTools.toMessage(arg);
		//console.log(toInsert);
		if (vscode.window.activeTextEditor) {
			vscode.window.activeTextEditor.edit(function(edit) {
				edit.replace(vscode.window.activeTextEditor.selection, toInsert);
			});
		} else {
			vscode.window.showInformationMessage("You need to select an editor before inserting.");
		}

		cc(arg);
	}, "insert");

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
		runHiss("(print (input-expression))");
	});

	// Insert the value of a Hiss expression
	let insert = vscode.commands.registerCommand('hiss-vscode.insert', function () {		
		runHiss("(insert (input-expression))");
	});

	// Restart the interpreter to clear state
	let restart = vscode.commands.registerCommand('hiss-vscode.restart', function () {
		freshInterpreter();
	});

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