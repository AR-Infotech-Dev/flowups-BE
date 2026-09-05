import { legacyRoutes } from "#routes/legacy.routes.js";

for (const route of legacyRoutes) {
  console.info(`${route.uriPattern} -> ${route.target} -> ${route.expressPath}`);
}
console.info(`Total routes: ${legacyRoutes.length}`);
