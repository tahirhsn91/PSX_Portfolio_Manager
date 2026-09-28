import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

/*
 * Self-hosted so loading the app makes no third-party request, and the figures
 * are in Fira's tabular set. Weights match what the UI actually uses: 400 body,
 * 500 emphasis, 600 headings; Code 400/500 for numerals and tickers.
 */
import '@fontsource/fira-sans/latin-400.css';
import '@fontsource/fira-sans/latin-500.css';
import '@fontsource/fira-sans/latin-600.css';
import '@fontsource/fira-code/latin-400.css';
import '@fontsource/fira-code/latin-500.css';

import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root not found in the document.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
