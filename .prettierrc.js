module.exports = {
  ...require('gts/.prettierrc.json'),
  overrides: [
    // Wrangler's config stays plain JSON-with-comments: no trailing commas.
    {files: '*.jsonc', options: {trailingComma: 'none'}},
  ],
};
