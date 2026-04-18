import "@testing-library/jest-dom";

// jsdom does not include fetch — provide a global mock
global.fetch = jest.fn();
