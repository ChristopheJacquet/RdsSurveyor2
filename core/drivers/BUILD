load("@aspect_rules_ts//ts:defs.bzl", "ts_project")
load("@aspect_rules_jasmine//jasmine:defs.bzl", "jasmine_test")


ts_project(
    name = "input",
    srcs = [
        "input.ts",
    ],
    transpiler = "tsc",
    declaration = True,  # Needed to be able to reference target in deps.
    source_map = True,
    composite = True,
    tsconfig = "//:tsconfig",
    visibility = ["//visibility:public"],
)
