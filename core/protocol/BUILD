load("@aspect_rules_ts//ts:defs.bzl", "ts_project")
load("@aspect_rules_jasmine//jasmine:defs.bzl", "jasmine_test")


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
        "//drivers:input",
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
    tsconfig = "//:tsconfig",
    deps = [
        "//:node_modules/@types/jasmine",
    ],
)

jasmine_test(
    name = "station_change_test",
    args = ["protocol/station_change_test.js"],
    data = [
        ":station_change_test_lib",
    ],
    copy_data_to_bin = False,
    node_modules = "//:node_modules",
    jasmine_reporters = False,
)
