load("@aspect_rules_ts//ts:defs.bzl", "ts_project")
load("@aspect_rules_jasmine//jasmine:defs.bzl", "jasmine_test")


ts_project(
    name = "protocol",
    srcs = [
        "base.ts",
        "rds_types.ts",
    ],
    transpiler = "tsc",
    declaration = True,  # Needed to be able to reference target in deps.
    source_map = True,
    composite = True,
    tsconfig = "//:tsconfig",
)

ts_project(
    name = "decoder_test_lib",
    srcs = ["decoder_test.ts"],
    transpiler = "tsc",
    declaration = True,
    source_map = True,
    composite = True,
    tsconfig = "//:tsconfig",
    deps = [
        ":protocol",
        "//:node_modules/@types/jasmine",
    ],
)

jasmine_test(
    name = "decoder_test",
    args = ["protocol/decoder_test.js"],
    #chdir = package_name(),
    data = [
        ":decoder_test_lib",
        #"//protocol:package.json",
    ],
    copy_data_to_bin = False,
    node_modules = "//:node_modules",
    jasmine_reporters = False,
)