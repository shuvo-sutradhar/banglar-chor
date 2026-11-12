import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/hind-siliguri/bengali-400.css';
import '@fontsource/hind-siliguri/bengali-600.css';
import '@fontsource/hind-siliguri/latin-400.css';
import '@fontsource/hind-siliguri/latin-600.css';
import './app/styles/index.css';
import { App } from './app/App';

const root = document.getElementById('root');
if (!root) throw new Error('Root element missing');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
