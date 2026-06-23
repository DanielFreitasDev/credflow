// Vitest global setup: extend `expect` with jest-dom matchers (the /vitest
// entry wires them into Vitest's expect, not Jest's global).
import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement scrollIntoView; stub it so components that keep the
// active option in view (e.g. <Select>) don't throw under test.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
