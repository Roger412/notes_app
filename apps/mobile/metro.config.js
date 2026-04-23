const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')
const fs = require('fs')

const projectRoot = __dirname
const monorepoRoot = path.resolve(projectRoot, '../..')
const isMonorepo = fs.existsSync(path.join(monorepoRoot, 'node_modules'))

const config = getDefaultConfig(projectRoot)

if (isMonorepo) {
  config.watchFolders = [monorepoRoot]

  config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(monorepoRoot, 'node_modules'),
  ]

  config.resolver.extraNodeModules = new Proxy(
    {},
    {
      get: (_target, name) =>
        path.resolve(monorepoRoot, 'node_modules', String(name)),
    }
  )

  // Intercept the relative ./node_modules/ path that Expo uses for its
  // entry point in pnpm monorepos where packages are hoisted to root.
  const defaultResolveRequest = config.resolver.resolveRequest
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName.startsWith('./node_modules/') || moduleName.startsWith('../node_modules/')) {
      const packagePath = moduleName.replace(/^(\.\.?\/)+node_modules\//, '')
      return (defaultResolveRequest || context.resolveRequest)(
        { ...context, originModulePath: path.join(monorepoRoot, 'package.json') },
        packagePath,
        platform
      )
    }
    if (defaultResolveRequest) {
      return defaultResolveRequest(context, moduleName, platform)
    }
    return context.resolveRequest(context, moduleName, platform)
  }
}

module.exports = config
