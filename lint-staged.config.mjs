const eslint = "eslint --max-warnings=0 --no-warn-ignored --fix";
const prettier = "prettier --write --ignore-unknown";

const lintStagedConfig = {
  "*.{ts,tsx,mts,cts}": [() => "next typegen", eslint, prettier],
  "*.{js,mjs,cjs}": [eslint, prettier],
  "*.{json,md,css,yml,yaml}": prettier,
};

export default lintStagedConfig;
