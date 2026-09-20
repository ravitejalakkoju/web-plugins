import renderToString from 'preact-render-to-string';
import { App } from './App';
import type { AdminState } from './types';

export interface RenderResult {
  html: string;
  title: string;
}

const TITLES: Record<AdminState['route']['name'], string> = {
  login: 'Sign in',
  widgets: 'Widgets',
  editor: 'Edit widget',
  health: 'Widget health',
};

export function render(state: AdminState): RenderResult {
  return {
    html: renderToString(<App state={state} />),
    title: `${TITLES[state.route.name]} · Web Plugins`,
  };
}
