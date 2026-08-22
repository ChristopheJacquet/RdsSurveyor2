load("@aspect_rules_ts//ts:defs.bzl", "ts_project")
load("@aspect_rules_jasmine//jasmine:defs.bzl", "jasmine_test")
load("@rules_python//python:defs.bzl", "py_binary")
load("@protocol_pip//:requirements.bzl", "requirement")
load("@aspect_bazel_lib//lib:write_source_files.bzl", "write_source_files")
load("@aspect_bazel_lib//lib:copy_to_bin.bzl", "copy_to_bin")

py_binary(
    name = "compiler",
    srcs = ["compiler.py"],
    deps = [requirement("lark")],
)

genrule(
    name = "gen_base_ts",
    srcs = [
        "base.p",
        "eon.p",
        "group_c.p",
        "odas.p",
        "rp.p",
    ],
    outs = ["_generated_base.ts"],
    tools = [":compiler"],
    cmd = "$(location :compiler) $(location base.p) $@",
)

# base.ts is generated from base.p (and the .p files it #includes) by
# compiler.py, rather than hand-written. `bazel run //core/protocol:update_base_ts`
# regenerates the checked-in copy that //ui and plain `ng serve`/`ng build`
# (which compile core's TypeScript directly, outside Bazel) rely on; CI can
# use `update_base_ts_test` to verify it isn't stale.
write_source_files(
    name = "update_base_ts",
    files = {
        "base.ts": ":gen_base_ts",
    },
)

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
    name = "protocol",
    srcs = [
        "af.ts",
        "base.ts",
        "dab_cross_ref.ts",
        "diagnostics.ts",
        "enhanced_radio_text.ts",
        "internet_connection.ts",
        "radio_text_plus.ts",
        "rbds_callsigns.ts",
        "rds_types.ts",
        "rft.ts",
        "rp.ts",
    ],
    transpiler = "tsc",
    declaration = True,  # Needed to be able to reference target in deps.
    source_map = True,
    composite = True,
    tsconfig = "//core:tsconfig",
    deps = [
        "//core/drivers:input",
    ],
)

ts_project(
    name = "decoder_test_lib",
    srcs = ["decoder_test.ts"],
    transpiler = "tsc",
    declaration = True,
    source_map = True,
    composite = True,
    tsconfig = "//core:tsconfig",
    deps = [
        ":protocol",
        "//core/drivers:input",
        "//core:node_modules/@types/jasmine",
    ],
)

jasmine_test(
    name = "decoder_test",
    args = ["core/protocol/decoder_test.js"],
    #chdir = package_name(),
    data = [
        ":decoder_test_lib",
        #"//protocol:package.json",
    ],
    copy_data_to_bin = False,
    node_modules = "//core:node_modules",
    jasmine_reporters = False,
)

ts_project(
    name = "station_change_test_lib",
    srcs = [
      "station_change.ts",
      "station_change_test.ts",
    ],
    transpiler = "tsc",
    declaration = True,
    source_map = True,
    composite = True,
    tsconfig = "//core:tsconfig",
    deps = [
        "//core/drivers:input",
        "//core:node_modules/@types/jasmine",
    ],
)

jasmine_test(
    name = "station_change_test",
    args = ["core/protocol/station_change_test.js"],
    data = [
        ":station_change_test_lib",
    ],
    copy_data_to_bin = False,
    node_modules = "//core:node_modules",
    jasmine_reporters = False,
)
