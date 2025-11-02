{
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "env": {
    "node": true,
    "es2022": true
  },
  "rules": {
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/no-explicit-any": "warn",
    "no-console": "off",
    "prefer-const": "error",
    "no-var": "error",
    "semi": ["error", "always"],
    "quotes": ["error", "single"]
  },
  "ignorePatterns": [
    "dist/",
    "node_modules/",
    "*.js"
  ]
}
