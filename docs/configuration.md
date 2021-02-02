Common Configurations
=====================

`trace-deps` is primarily used upstream in our packaging libraries:

- [trace-pkg](https://github.com/FormidableLabs/trace-pkg): General purpose zip file application packaging CLI.
- [serverless-jetpack](https://github.com/FormidableLabs/serverless-jetpack): A faster JavaScript packager for Serverless Framework applications.

In surveying our various project work, we've compiled an annotated list of common configurations for situations involving missing/optional imports and dynamic imports. The configurations below won't apply to all possible application situations, but should get you most of the way there for a lot of them:

```yml
# Our base configurations applicable to all tools.
configs:
  # Static imports that may be missing in common libraries.
  allowMissing: &allowMissing
    # For just the `ws` package allow certain lazy dependencies to be
    # skipped without error if not found on disk.
    "ws":
      - "bufferutil"
      - "utf-8-validate"

    # Runtime optional dependency (with check).
    "@ampproject/toolbox-optimizer":
      - "jimp"
      - "probe-image-size"

    # `redis-parser` has an optional + undeclared dependency on `hiredis`
    # for legacy mode (try/catch-ed) which is optional.
    'redis-parser': ['hiredis']
    
    # adm-zip has support for electron original-fs which we don't need
    'adm-zip': ['original-fs']

  # Dynamic import misses in common libraries.
  dynamic:
    resolutions: &resolutions
      # The library loads transformations found here:
      # https://unpkg.com/browse/@ampproject/toolbox-optimizer/lib/transformers/
      # based on configuration with a default set.
      #
      # We just add them all enumerated. Alternately, the list could be honed
      # to known usage, or set to `false` if none are used.
      #
      # - [163:22]: require(`./transformers/${Transformer}.js`)
      #
      "@ampproject/toolbox-optimizer/lib/DomTransformer.js":
        - ./transformers/AddAmpLink.js
        - ./transformers/AddBlurryImagePlaceholders.js
        - ./transformers/AddMandatoryTags.js
        - ./transformers/AddTransformedFlag.js
        - ./transformers/AmpBoilerplateTransformer.js
        - ./transformers/AmpScriptCsp.js
        - ./transformers/ApplyLayout.js
        - ./transformers/AutoExtensionImporter.js
        - ./transformers/GoogleFontsPreconnect.js
        - ./transformers/Markdown.js
        - ./transformers/MinifyHtml.js
        - ./transformers/PreloadImages.js
        - ./transformers/PruneDuplicateResourceHints.js
        - ./transformers/RemoveAmpAttribute.js
        - ./transformers/RemoveCspNonce.js
        - ./transformers/ReorderHeadTransformer.js
        - ./transformers/RewriteAmpUrls.js
        - ./transformers/SeparateKeyframes.js
        - ./transformers/ServerSideRendering.js
      "@ampproject/toolbox-optimizer/lib/isDependencyInstalled.js": false

      # Dynamic imports of internal libraries.
      "@heroku/socksv5/index.js":
        - "./lib/constants.js"
        - "./lib/client.js"
        - "./lib/server.parser.js"
        - "./lib/Agents.js"
        - "./lib/auth/UserPassword.js"
        - "./lib/auth/None.js"
        - "./lib/server.js"
        - "./lib/utils.js"
        - "./lib/client.parser.js"

      # AWS X-Ray SDK allows consumers to specify a custom whitelist file
      # which we don't do. We should update and "include" appropriately
      # if this changes.
      #
      # - [41:32]: require(source)
      #
      "aws-xray-sdk-core/lib/patchers/call_capturer.js": false

      # Optional requires with `+ ''` to prevent resolution by bundlers.
      # You can omit with `false` or add in specifically if used and
      # independently installed
      #
      # - `dtrace = require('dtrace-provider' + '');`
      # - `var mv = require('mv' + '');`
      # - `var sourceMapSupport = require('source-map-support' + '');`
      "bunyan/lib/bunyan.js": false

      # `colors` has a dynamic theme loader, which isn't typically used.
      #
      # - [127:29]: require(theme)
      #
      "colors/lib/colors.js": false

      # The config package uses dynamic imports of a known config directory.
      # We ignore here and you should separately use an `include` to trace
      # additional configuration files in your application source, e.g. often
      # something like `config/**/*.js`.
      #
      # - [773:21]: require(fullFilename)
      # - [777:8]: require(TS_DEP)
      # - [787:21]: require(fullFilename)
      # - [813:19]: require(COFFEE_2_DEP)
      # - [817:19]: require(COFFEE_DEP)
      # - [826:21]: require(fullFilename)
      # - [829:13]: require(ICED_DEP)
      # - [895:15]: require(JS_YAML_DEP)
      # - [900:28]: require(YAML_DEP)
      # - [931:16]: require(JSON5_DEP)
      # - [940:14]: require(JSON5_DEP)
      # - [948:14]: require(HJSON_DEP)
      # - [956:13]: require(TOML_DEP)
      # - [963:13]: require(CSON_DEP)
      # - [974:16]: require(PPARSER_DEP)
      # - [980:12]: require(XML_DEP)
      #
      "config/lib/config.js": false

      # Dynamic require to detect if library is already installed. Should be
      # able to safely ignore.
      "datadog-lambda-js/dist/trace/tracer-wrapper.js": false

      # Dynamically imports existing modules to instrument. Since we'll
      # separately trace the actual dependencies, should be safe to ignore.
      "dd-trace/packages/dd-trace/src/platform/node/loader.js": false

      # This is just try/catch-ed permissive require meant to be
      # excluded in browser and is optional. We just ignore it.
      #
      # - [9:12]: require(iconv_package)
      #
      "encoding/lib/iconv-loader.js": false

      # Express dynamically imports view engines, which you can ignore if
      # unused or add it specifically here or in an `include`.
      #
      # - [81:13]: require(mod)
      #
      "express/lib/view.js": false

      # Uses `require.resolve` as a fallback method to read an aribtrary file.
      "liquidjs/dist/liquid.cjs.js": false
      "liquidjs/dist/liquid.node.cjs.js": false

      # Lazy-load all transports, so we manually include all of them here.
      "logform/index.js":
        - "logform/errors.js"
        - "logform/align.js"
        - "logform/errors.js"
        - "logform/cli.js"
        - "logform/combine.js"
        - "logform/colorize.js"
        - "logform/json.js"
        - "logform/label.js"
        - "logform/logstash.js"
        - "logform/metadata.js"
        - "logform/ms.js"
        - "logform/pad-levels.js"
        - "logform/pretty-print.js"
        - "logform/printf.js"
        - "logform/simple.js"
        - "logform/splat.js"
        - "logform/timestamp.js"
        - "logform/uncolorize.js"

      # pkginfo analyzes package.json files, and we separately ensure their
      # presence via other tracing.
      #
      # - [104:15]: require(dir + '/package.json')
      #
      "pkginfo/lib/pkginfo.js": false

# `serverless-jetpack`
custom: # OR `functions.<NAME>`
  jetpack:
    trace:
      allowMissing: *allowMissing
      dynamic:
        resolutions: *resolutions

# `trace-pkg`
options: # OR `packages.<NAME>`
  allowMissing: *allowMissing
  dynamic:
    resolutions: *resolutions
```
