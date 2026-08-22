load("@aspect_rules_ts//ts:defs.bzl", "ts_project")
load("@aspect_rules_jasmine//jasmine:defs.bzl", "jasmine_test")
load("@aspect_bazel_lib//lib:copy_to_bin.bzl", "copy_to_bin")

# Exposes core's TypeScript sources to //ui, which currently imports them
# directly (not via the compiled Bazel outputs) since the Angular CLI
# compiles them itself as part of the app bundle. Pre-copied to bin here
# (in this package) since js_run_binary's copy_srcs_to_bin can't copy
# files belonging to another package.
copy_to_bin(
    name = "srcs",
    srcs = glob(["*.ts"]),
    visibility = ["//ui:__pkg__"],
)


ts_project(
    name = "input",
    srcs = [
        "input.ts",
    ],
    transpiler = "tsc",
    declaration = True,  # Needed to be able to reference target in deps.
    source_map = True,
    composite = True,
    tsconfig = "//core:tsconfig",
    visibility = ["//visibility:public"],
)
