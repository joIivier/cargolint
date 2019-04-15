VSCode extension checking Rust code with cargo --check

The official Rust extension is here: https://github.com/rust-lang/rls-vscode

Use this one only if you experience performance issues with the above one and none of the advices in https://github.com/rust-lang/rls/blob/master/debugging.md helped.
This can occur if your own project is very large (the json of your own project in `target/rls/deps/save-analysis` is over 1mb for instance).

This extension only provides compilation errors and warnings, no auto-completion nor formatting.

