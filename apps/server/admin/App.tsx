import { LoginPage } from './pages/Login';
import { WidgetEditorPage } from './pages/WidgetEditor';
import { WidgetHealthPage } from './pages/WidgetHealth';
import { WidgetListPage } from './pages/WidgetList';
import type { AdminState } from './types';

/**
 * One component tree for both passes. Navigation is plain links and full page
 * loads: the server already has the data, so a client router would only add a
 * second way for the two to disagree.
 */
export function App({ state }: { state: AdminState }) {
  const { route } = state;

  switch (route.name) {
    case 'login':
      return <LoginPage />;
    case 'widgets':
      return <WidgetListPage data={route.data} />;
    case 'editor':
      return <WidgetEditorPage data={route.data} />;
    case 'health':
      return <WidgetHealthPage data={route.data} />;
  }
}
