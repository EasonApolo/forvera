import { Dispatcher } from 'undici';

export function routeGeminiRequests(direct: Dispatcher, proxy: Dispatcher): Dispatcher {
  return direct.compose((dispatch) => (options, handler) => {
    if (options.origin && new URL(options.origin).hostname === 'generativelanguage.googleapis.com') {
      return proxy.dispatch(options, handler);
    }
    return dispatch(options, handler);
  });
}