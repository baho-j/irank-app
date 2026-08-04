import coreWebVitals from "eslint-config-next/core-web-vitals";

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "convex/_generated/**",
      "next-env.d.ts",
    ],
  },
  ...coreWebVitals,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];
