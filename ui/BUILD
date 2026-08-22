load("@npm//:defs.bzl", "npm_link_all_packages")
load("@aspect_rules_js//js:defs.bzl", "js_binary", "js_run_binary")

npm_link_all_packages(name = "node_modules")

js_binary(
    name = "ng_bin",
    entry_point = "tools/ng.js",
    data = [":node_modules"],
    patch_node_fs = False,
)

js_run_binary(
    name = "build",
    tool = ":ng_bin",
    srcs = glob(
        [
            "src/**",
            "public/**",
        ],
    ) + [
        "angular.json",
        "package.json",
        "tsconfig.json",
        "tsconfig.app.json",
        ":node_modules",
        "//core:node_modules",
        "//core/drivers:srcs",
        "//core/protocol:srcs",
        "//core/signals:srcs",
    ],
    args = ["build", "--configuration", "production", "--preserve-symlinks"],
    out_dirs = ["dist"],
    chdir = package_name(),
)
