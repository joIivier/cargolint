// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SpawnOptions, spawn } from 'child_process';

function toPromiseUntyped(f) {
  return (...args) => new Promise((resolve, reject) => {
    f(...args, (err, result) => {
    if (err) {
      reject(err);
    } else {
      resolve(result);
    }
    });
  });
}

function toPromise1<I, O>(f: (i: I, callback: ((err: NodeJS.ErrnoException, o: O) => void)) => void): (i: I) => Promise<O> {
  return toPromiseUntyped(f) as (i: I) => Promise<O>;
}

const stat = toPromise1(fs.stat);

const testExists = async (f: string): Promise<boolean> => {
  try {
    await stat(f);
    return true;
  } catch (e) {
    return false;
  }
};

const findCargoRoot = async (fileName: string): Promise<string> => {
  let folder = path.dirname(fileName);
  while (true) {
    const testPath = path.join(folder, 'Cargo.toml');
    const exists = await testExists(testPath);
    if (exists) {
      return folder;
    } else {
      folder = path.join(folder, '..');
    }
    if (folder === '/') {
      return Promise.reject('No Cargo.toml found in any parent folder.');
    }
  }
};

const execArgs = function(command: string, args: string[], options: SpawnOptions): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const s = spawn(command, args, options);
    let stdout = '';
    let stderr = '';
    s.stdout.on('data', data => {
      stdout += data;
    });
    s.stderr.on('data', data => {
      stderr += data;
    });
    s.on('error', e => {
      reject({stdout, stderr, error: e});
    });
    s.on('close', code => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject({stdout, stderr});
      }
    });
  });
};

interface CheckMessageSpan {
  file_name: string,
  line_start: number,
  line_end: number,
  column_start: number,
  column_end: number,
  is_primary: boolean,
  label: string,
  suggested_replacement: string,
  suggestion_applicability: string,
  expansion: string,
}

interface CheckMessage {
  reason: string,
  package_id: string,
  target: {
    name: string,
    edition: string,
    src_path: string,
  },
  message: {
    message: string,
    code?: {
      code: string,
      explanation,
    },
    level: string,
    spans: CheckMessageSpan[]
  }
}

const runCargoCheck = async function(cargoRoot: string): Promise<CheckMessage[]> {
  try {
    await execArgs('cargo', ['check', '--message-format', 'json'], {cwd: cargoRoot});
    return [];
  } catch (e) {
    const {stdout} = e;
    const lines = stdout.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    return lines.map((l, i) => {
      let v = null;
      try {
        v = JSON.parse(l);
      } catch (e) {
        vscode.window.showErrorMessage('Could not parse cargo check result line', i + 1, ' containing "', l, '". JSON.parse threw:', e);
      }
      return v;
    });
  }
};

function getSeverity(message: CheckMessage, span: CheckMessageSpan) {
  if (span.is_primary) {
    if (message.message.level === 'error') {
      return vscode.DiagnosticSeverity.Error;
    } else {
      return vscode.DiagnosticSeverity.Warning;
    }
  } else {
    return vscode.DiagnosticSeverity.Hint;
  }
}

function getLabel(message: CheckMessage, span: CheckMessageSpan) {
  if (span.label === null) {
    return message.message.message;
  } else {
    return `${message.message.message}: ${span.label}`;
  }
}

export function activate(_context: vscode.ExtensionContext) {
  let dc = vscode.languages.createDiagnosticCollection("cargolint");
  const diagnosticsPerFile = new Map<string, vscode.Diagnostic[]>();
  vscode.workspace.onDidSaveTextDocument(async (document: vscode.TextDocument) => {
    if (document.fileName.endsWith('.rs')) {
      try {
        const cargoRoot = await findCargoRoot(document.fileName);
        const messages = await runCargoCheck(cargoRoot);
        // Clear previous diagnostics
        for (let [_file, diagnostics] of diagnosticsPerFile) {
          diagnostics.length = 0;
        }
        for (let message of messages) {
          if (message.message === undefined) {
            continue;
          }
          for (let span of message.message.spans) {
            const diagnostic = new vscode.Diagnostic(
              new vscode.Range(new vscode.Position(span.line_start - 1, span.column_start - 1), new vscode.Position(span.line_end - 1, span.column_end - 1)),
              getLabel(message, span),
              getSeverity(message, span));
            const file_full_path = path.join(cargoRoot, span.file_name);
            let diagnosticsOfFile = diagnosticsPerFile.get(file_full_path);
            if (diagnosticsOfFile === undefined) {
              diagnosticsOfFile = [];
              diagnosticsPerFile.set(file_full_path, diagnosticsOfFile);
            }
            diagnosticsOfFile.push(diagnostic);
          }
        }
        for (let [file, diagnostics] of diagnosticsPerFile) {
          dc.set(vscode.Uri.file(file), diagnostics);
        }
      } catch (e) {
        vscode.window.showErrorMessage(`Could not cargolint: ${e}`);
      }
    }
  });
}

// this method is called when your extension is deactivated
export function deactivate() {}