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
    name = "bitstream",
    srcs = [
        "bitstream.ts",
    ],
    deps = [
        "//core/drivers:input",
    ],
    transpiler = "tsc",
    declaration = True,  # Needed to be able to reference target in deps.
    source_map = True,
    composite = True,
    tsconfig = "//core:tsconfig",
)

ts_project(
    name = "bitstream_test_lib",
    srcs = ["bitstream_test.ts"],
    transpiler = "tsc",
    declaration = True,
    source_map = True,
    composite = True,
    tsconfig = "//core:tsconfig",
    deps = [
        ":bitstream",
        "//core:node_modules/@types/jasmine",
    ],
)

jasmine_test(
    name = "bitstream_test",
    args = ["core/signals/bitstream_test.js"],
    data = [
        ":bitstream_test_lib",
    ],
    copy_data_to_bin = False,
    node_modules = "//core:node_modules",
    jasmine_reporters = False,
)
