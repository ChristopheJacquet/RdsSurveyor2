load("@aspect_rules_ts//ts:defs.bzl", "ts_project")
load("@aspect_rules_jasmine//jasmine:defs.bzl", "jasmine_test")


ts_project(
    name = "bitstream",
    srcs = [
        "bitstream.ts",
    ],
    transpiler = "tsc",
    declaration = True,  # Needed to be able to reference target in deps.
    source_map = True,
    composite = True,
    tsconfig = "//:tsconfig",
)

ts_project(
    name = "bitstream_test_lib",
    srcs = ["bitstream_test.ts"],
    transpiler = "tsc",
    declaration = True,
    source_map = True,
    composite = True,
    tsconfig = "//:tsconfig",
    deps = [
        ":bitstream",
        "//:node_modules/@types/jasmine",
    ],
)

jasmine_test(
    name = "bitstream_test",
    args = ["signals/bitstream_test.js"],
    data = [
        ":bitstream_test_lib",
    ],
    copy_data_to_bin = False,
    node_modules = "//:node_modules",
    jasmine_reporters = False,
)
