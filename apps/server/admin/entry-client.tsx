import { hydrate } from 'preact';
import { App } from './App';
import type { AdminState } from './types';
import './styles.css';

declare global {
  interface Window {
    __WP_ADMIN__?: AdminState;
  }
}

const state = window.__WP_ADMIN__;
const root = document.getElementById('app');

if (state && root) {
  hydrate(<App state={state} />, root);
}
